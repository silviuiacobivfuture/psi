import { afterEach, describe, expect, it } from "vitest";
import { LIST_PAGE } from "../port/port";
import { type Console, MEMBER, startConsole } from "./harness";

/**
 * The team (Setări → Membri) on the in-memory clinic, a page at a time: one page and "Mai multe",
 * which appends the next page into the open list and goes with the last; a short list has no control; an empty one
 * says so; a member on a later page still opens their sheet; the next page is refused to who may not see the
 * list, answering nothing of it.
 */
let c: Console;
afterEach(() => c.close());

const DATASTAR = { headers: { "datastar-request": "true" } };

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

const addMembers = async (n: number): Promise<void> => {
	for (let i = 0; i < n; i++)
		await c.port.saveMember("psizone", `paged-${String(i).padStart(3, "0")}`, {
			displayName: `Membru Pagină ${String(i).padStart(3, "0")}`,
			roles: ["reception"],
		});
};

describe("the team, a page at a time", () => {
	it("many: a page by name, then the rest appended, every one once, the control gone with the last", async () => {
		c = await startConsole(MEMBER);
		await c.signIn();
		await addMembers(LIST_PAGE + 4);
		const team = await c.port.members("psizone");
		const first = await (await c.get("/settings/members")).text();
		const { firstRows, all, last, answers } = await walk(
			first,
			"/settings/members/more",
			"member-list",
			/data-member="([^"]+)"/g,
		);
		expect(firstRows).toBe(LIST_PAGE);
		expect(answers).toBe(Math.ceil(team.length / LIST_PAGE) - 1);
		expect(new Set(all)).toEqual(new Set(team.map((x) => x.subject)));
		expect(all).toHaveLength(team.length);
		const names = new Map(team.map((x) => [x.subject, x.displayName]));
		const ordered = all.map((s) => names.get(s) ?? "");
		expect(ordered).toEqual([...ordered].sort((a, b) => a.localeCompare(b)));
		expect(last).toContain('id="member-more"');
		expect(moreOf(last, "/settings/members/more")).toBeNull();
	});

	it("a member on a later page opens their editor and their removal sheet", async () => {
		c = await startConsole(MEMBER);
		await c.signIn();
		await addMembers(LIST_PAGE + 4);
		const late = "paged-053";
		const first = await (await c.get("/settings/members")).text();
		expect(first).not.toContain(`data-member="${late}"`);
		const editing = await (await c.get(`/settings/members?edit=${late}`)).text();
		expect(editing).toContain("Membru Pagină 053");
		const removing = await (await c.get(`/settings/members?confirm=${late}`)).text();
		expect(removing).toContain(`/settings/members/${late}/remove`);
		expect(removing).toMatch(/askMemberRemove(&quot;|")?:true/);
	});

	it("one page: a small team has no control", async () => {
		c = await startConsole(MEMBER);
		await c.signIn();
		const html = await (await c.get("/settings/members")).text();
		expect(html).toContain("data-member=");
		expect(html.split("data-member=").length - 1).toBeLessThan(LIST_PAGE);
		expect(moreOf(html, "/settings/members/more")).toBeNull();
		expect(html).toContain('id="member-more"');
	});
});

describe("the next page is refused to who may not see the list", () => {
	it.each(["/settings/members/more?cursor=50&shown=50"])("%s", async (path) => {
		c = await startConsole(MEMBER, {}, { [MEMBER.sub]: [{ app: "psizone", roles: ["nope"] }] });
		await c.signIn();
		const res = await c.get(path, DATASTAR);
		expect(res.status).toBe(403);
		const body = await res.text();
		expect(body).not.toContain("mode append");
		expect(body).not.toContain("data-member=");
	});
});
