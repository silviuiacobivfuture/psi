import { afterEach, describe, expect, it } from "vitest";
import { LIST_PAGE } from "../port/port";
import { type Console, MEMBER, startConsole } from "./harness";

/**
 * A client's files on the in-memory clinic, a page at a time: one page and "Mai multe", which appends the next page
 * into the open list and goes with the last; a short list has no control; an empty one says so; a file on a later
 * page still opens its sheet; the next page is refused to who may not see the files, answering nothing of them. (The
 * team is numbered pages: lists-paging.test.ts.)
 */
let c: Console;
afterEach(() => c.close());

const DATASTAR = { headers: { "datastar-request": "true" } };
const BY = { subject: MEMBER.sub, name: "Ana Test" };

/** The `…/more` address a page carries, or null. */
const moreOf = (html: string, path: string): string | null => {
	const at = new RegExp(`(${path.replaceAll("/", "\\/")}\\?[^'"]*?)(?:'|&#39;)`).exec(html)?.[1];
	return at === undefined ? null : at.replaceAll("&amp;", "&");
};

/** Every row of a list, page after page through its "show more". */
async function walk(
	first: string,
	more: string,
	list: string,
	row: RegExp,
): Promise<{ firstRows: number; all: string[]; last: string; answers: number }> {
	const all = [...first.matchAll(row)].map((x) => x[1] ?? "");
	const firstRows = all.length;
	let next = moreOf(first, more);
	let last = first;
	let answers = 0;
	while (next !== null) {
		const res = await c.get(next, DATASTAR);
		expect(res.headers.get("content-type")).toContain("text/event-stream");
		last = await res.text();
		expect(last).toContain(`selector #${list}`);
		expect(last).toContain("mode append");
		all.push(...[...last.matchAll(row)].map((x) => x[1] ?? ""));
		next = moreOf(last, more);
		answers++;
	}
	return { firstRows, all, last, answers };
}

const addFiles = async (client: string, n: number): Promise<void> => {
	for (let i = 0; i < n; i++)
		await c.port.uploadFile(
			"psizone",
			client,
			{
				name: `fisier-${i}.txt`,
				contentType: "text/plain",
				bytes: new TextEncoder().encode(`${i}`),
			},
			BY,
		);
};

describe("a client's files, a page at a time", () => {
	it("many: a page, then the rest appended, every one once, the control gone with the last", async () => {
		c = await startConsole(MEMBER);
		await c.signIn();
		await addFiles("c3", LIST_PAGE + 5);
		const total = (await c.port.files("psizone", "c3")).length;
		const first = await (await c.get("/clients/c3/files")).text();
		const { firstRows, all, last } = await walk(
			first,
			"/clients/c3/more/files",
			"cl-list-files",
			/data-file="([^"]+)"/g,
		);
		expect(firstRows).toBe(LIST_PAGE);
		expect(all).toHaveLength(total);
		expect(new Set(all).size).toBe(total);
		expect(last).toContain('id="cl-more-files"');
		expect(moreOf(last, "/clients/c3/more/files")).toBeNull();
	});

	it("a file on a later page opens its rename sheet", async () => {
		c = await startConsole(MEMBER);
		await c.signIn();
		await addFiles("c3", LIST_PAGE + 5);
		const files = await c.port.files("psizone", "c3");
		const late = files[files.length - 1];
		const first = await (await c.get("/clients/c3/files")).text();
		expect(first).not.toContain(`data-file="${late?.id}"`);
		const html = await (await c.get(`/clients/c3/files?rename=${late?.id}`)).text();
		expect(html).toContain(`/clients/c3/files/${late?.id}/rename`);
	});

	it("one page has no control; none: the empty state", async () => {
		c = await startConsole(MEMBER);
		await c.signIn();
		await addFiles("c3", 2);
		const few = await (await c.get("/clients/c3/files")).text();
		expect(few.split("data-file=").length - 1).toBe(2);
		expect(moreOf(few, "/clients/c3/more/files")).toBeNull();
		const made = await c.port.createClient("psizone", {
			name: "Fără Fișiere",
			phone: null,
			guardian: null,
		});
		const none = await (await c.get(`/clients/${made.id}/files`)).text();
		expect(none).not.toContain("data-file=");
		expect(none).not.toContain('id="cl-list-files"');
		expect(moreOf(none, `/clients/${made.id}/more/files`)).toBeNull();
	});
});

describe("the next page is refused to who may not see the list", () => {
	it.each(["/clients/c3/more/files?cursor=50&shown=50"])("%s", async (path) => {
		c = await startConsole(MEMBER, {}, { [MEMBER.sub]: [{ app: "psizone", roles: ["nope"] }] });
		await c.signIn();
		const res = await c.get(path, DATASTAR);
		expect(res.status).toBe(403);
		const body = await res.text();
		expect(body).not.toContain("mode append");
		expect(body).not.toContain("data-member=");
		expect(body).not.toContain("data-file=");
	});
});
