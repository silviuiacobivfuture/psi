import { afterEach, describe, expect, it } from "vitest";
import { addDays } from "../lib/dates";
import { LIST_PAGE } from "../port/port";
import { type Console, MEMBER, startConsole } from "./harness";

/**
 * A client's appointments, notes and records, a page at a time: one page and "Mai multe", which appends the next
 * page into the open tab and goes with the last; a short list has no control; an empty one says so; the next page
 * is refused to who may not see the tab.
 */
let c: Console;
afterEach(() => c.close());

const DATASTAR = { headers: { "datastar-request": "true" } };
const moreOf = (html: string, tab: string): string | null => {
	const at = new RegExp(`(\\/clients\\/[^/]+\\/more\\/${tab}\\?[^'"]*?)(?:'|&#39;)`).exec(
		html,
	)?.[1];
	return at === undefined ? null : at.replaceAll("&amp;", "&");
};

async function walk(
	first: string,
	tab: string,
	row: RegExp,
): Promise<{ firstRows: number; all: string[]; last: string }> {
	const all = [...first.matchAll(row)].map((x) => x[1] ?? "");
	const firstRows = all.length;
	let next = moreOf(first, tab);
	let last = first;
	while (next !== null) {
		const res = await c.get(next, DATASTAR);
		expect(res.headers.get("content-type")).toContain("text/event-stream");
		last = await res.text();
		expect(last).toContain(`selector #cl-list-${tab}`);
		all.push(...[...last.matchAll(row)].map((x) => x[1] ?? ""));
		next = moreOf(last, tab);
	}
	return { firstRows, all, last };
}

describe("a client's appointments, a page at a time", () => {
	it("many: a page, then the rest appended, every one once, the control gone with the last", async () => {
		c = await startConsole(MEMBER);
		await c.signIn();
		for (let i = 0; i < LIST_PAGE + 6; i++)
			await c.port.createAppointments("psizone", {
				date: addDays("2027-01-04", i),
				startMin: 600,
				columnId: "p1",
				clientId: "c1",
				serviceId: "s1",
			});
		const total = (await c.port.clientAppointments("psizone", "c1")).length;
		const first = await (await c.get("/clients/c1/appointments")).text();
		const { firstRows, all, last } = await walk(
			first,
			"appointments",
			/data-appointment="([^"]+)"/g,
		);
		expect(firstRows).toBe(LIST_PAGE);
		expect(all).toHaveLength(total);
		expect(new Set(all).size).toBe(total);
		expect(last).toContain('id="cl-more-appointments"');
		expect(moreOf(last, "appointments")).toBeNull();
	});

	it("one page: a client with few has no control; none: the empty state", async () => {
		c = await startConsole(MEMBER);
		await c.signIn();
		const few = await (await c.get("/clients/c1/appointments")).text();
		expect(few).toContain("data-appointment=");
		expect(moreOf(few, "appointments")).toBeNull();
		const made = await c.port.createClient("psizone", {
			name: "Fără Programări",
			phone: null,
			guardian: null,
		});
		const none = await (await c.get(`/clients/${made.id}/appointments`)).text();
		expect(none).not.toContain("data-appointment=");
		expect(moreOf(none, "appointments")).toBeNull();
	});
});

describe("a client's notes, a page at a time", () => {
	it("many: a page, then the rest appended, the control gone with the last", async () => {
		c = await startConsole(MEMBER);
		await c.signIn();
		for (let i = 0; i < LIST_PAGE + 3; i++)
			await c.port.addNote(
				"psizone",
				"c2",
				{ body: `Notă de test ${i}`, category: "general" },
				{ subject: MEMBER.sub, name: "Test" },
			);
		const total = (await c.port.notes("psizone", "c2")).length;
		const first = await (await c.get("/clients/c2/notes")).text();
		const { firstRows, all, last } = await walk(first, "notes", /data-note="([^"]+)"/g);
		expect(firstRows).toBe(LIST_PAGE);
		expect(new Set(all).size).toBe(total);
		expect(moreOf(last, "notes")).toBeNull();
	});
});

describe("a client tab's next page is refused to who may not see the tab", () => {
	it.each([
		"/clients/c1/more/appointments?cursor=50&shown=50",
		"/clients/c1/more/notes?cursor=50&shown=50",
		"/clients/c1/more/records?cursor=50&shown=50",
	])("%s", async (path) => {
		c = await startConsole(MEMBER, {}, { [MEMBER.sub]: [{ app: "psizone", roles: ["nope"] }] });
		await c.signIn();
		const res = await c.get(path, DATASTAR);
		expect(res.status).toBe(403);
		expect(await res.text()).not.toContain("mode append");
	});
});
