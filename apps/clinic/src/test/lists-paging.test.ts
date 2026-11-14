import { afterEach, describe, expect, it } from "vitest";
import { type Console, MEMBER, startConsole } from "./harness";

/**
 * The team, the requests, the blacklist and a day's reminders as numbered pages on the in-memory clinic: the
 * boundaries (empty, one page, an exact multiple, the last partial page, past the end), a size change keeping the
 * first row in view, the canonical address, the in-place answer (the region patched, the address pushed, never an
 * append), and each list refused, answering nothing, to who may not see it.
 */
let c: Console;
afterEach(() => c.close());

const DATASTAR = { headers: { "datastar-request": "true" } };
const range = (html: string): string => /data-range[^>]*>([^<]+)</.exec(html)?.[1] ?? "";
const current = (html: string): string => /aria-current="page"[^>]*>(\d+)</.exec(html)?.[1] ?? "";
const count = (html: string, marker: string): number => html.split(marker).length - 1;
const MEMBER_ROW = "data-member=";

const addMembers = async (n: number): Promise<void> => {
	for (let i = 0; i < n; i++)
		await c.port.saveMember("psizone", `paged-${String(i).padStart(3, "0")}`, {
			displayName: `Membru Pagină ${String(i).padStart(3, "0")}`,
			roles: ["reception"],
		});
};
const team = async (): Promise<number> => (await c.port.members("psizone")).length;
const page = async (path: string): Promise<string> => {
	const res = await c.get(path);
	expect(res.status).toBe(200);
	return res.text();
};

describe("the team in numbered pages", () => {
	it("an exact multiple: every page full, the last one without a next link, past the end the last", async () => {
		c = await startConsole(MEMBER);
		await c.signIn();
		await addMembers(75 - (await team()));
		expect(await team()).toBe(75);
		const third = await page("/settings/members?page=3&size=25");
		expect([count(third, MEMBER_ROW), range(third), current(third)]).toEqual([
			25,
			"51–75 din 75",
			"3",
		]);
		expect(third).not.toContain('rel="next"');
		expect(current(await page("/settings/members?page=9&size=25"))).toBe("3");
	});

	it("a last partial page; every member once, by name, across the pages", async () => {
		c = await startConsole(MEMBER);
		await c.signIn();
		await addMembers(60);
		const total = await team();
		const seen: string[] = [];
		for (let p = 1; p <= Math.ceil(total / 25); p++) {
			const html = await page(`/settings/members?page=${p}&size=25`);
			seen.push(...[...html.matchAll(/data-member="([^"]+)"/g)].map((x) => x[1] ?? ""));
		}
		expect(seen).toHaveLength(total);
		expect(new Set(seen).size).toBe(total);
		const last = await page(`/settings/members?page=${Math.ceil(total / 25)}&size=25`);
		expect(count(last, MEMBER_ROW)).toBe(total - 25 * (Math.ceil(total / 25) - 1));
	});

	it("one page: a small team has no page links, and says how many", async () => {
		c = await startConsole(MEMBER);
		await c.signIn();
		const total = await team();
		const html = await page("/settings/members");
		expect(count(html, MEMBER_ROW)).toBe(total);
		expect(range(html)).toBe(`1–${total} din ${total}`);
		expect(html).not.toContain('class="adm-pager__pages"');
		expect(html).not.toContain("/settings/members/more");
	});

	it("a size change opens the page holding the first row shown", async () => {
		c = await startConsole(MEMBER);
		await c.signIn();
		await addMembers(120);
		expect(current(await page("/settings/members?from=50&size=25&via=size"))).toBe("3");
		expect(current(await page("/settings/members?from=75&size=50&via=size"))).toBe("2");
		expect(current(await page("/settings/members?from=75&size=100&via=size"))).toBe("1");
	});

	it("a member on a later page still opens their editor", async () => {
		c = await startConsole(MEMBER);
		await c.signIn();
		await addMembers(60);
		expect(await page("/settings/members?size=25")).not.toContain('data-member="paged-053"');
		expect(await page("/settings/members?edit=paged-053")).toContain("Membru Pagină 053");
	});

	it("fetched in place: the region patched, the address pushed, the focus moved, nothing appended", async () => {
		c = await startConsole(MEMBER);
		await c.signIn();
		await addMembers(60);
		const res = await c.get("/settings/members?page=2&size=25", DATASTAR);
		expect(res.headers.get("content-type")).toContain("text/event-stream");
		const body = await res.text();
		expect(body).toContain('id="members-region"');
		expect(body).not.toContain("selector #member-list");
		expect(count(body, MEMBER_ROW)).toBe(25);
		expect(body).toContain('history.pushState(null, "", "/settings/members?page=2&size=25")');
		expect(body).toContain('getElementById("members-region")?.focus');
	});
});

describe("the requests, the blacklist and the reminders in numbered pages", () => {
	it("requests: the open ones on one page, counted; the handled tab keeps its own address", async () => {
		c = await startConsole(MEMBER);
		await c.signIn();
		const open = (await c.port.requests("psizone")).filter((r) => !r.handled).length;
		const html = await page("/requests");
		expect(count(html, 'class="adm-card request"')).toBe(open);
		expect(html).toContain(`(${open})`);
		expect(range(html)).toBe(`1–${open} din ${open}`);
		expect(html).toContain('href="/requests?show=handled&amp;page=1&amp;size=50"');
		const body = await (await c.get("/requests?show=handled&page=1&size=25", DATASTAR)).text();
		expect(body).toContain('"/requests?show=handled&page=1&size=25"');
	});

	it("requests: none at all, the empty state and no pager", async () => {
		c = await startConsole(MEMBER, { empty: true });
		await c.signIn();
		const html = await page("/requests");
		expect(html).not.toContain('class="adm-card request"');
		expect(html).not.toContain('id="requests-pager"');
	});

	it("blacklist: the few listed on one page, each named; none, the empty state", async () => {
		c = await startConsole(MEMBER);
		await c.signIn();
		const listed = (await c.port.clientSummaries("psizone", "current", "")).filter(
			(s) => s.blacklist !== null,
		).length;
		expect(listed).toBeGreaterThan(0);
		const html = await page("/settings/blacklist");
		expect(count(html, "data-listed=")).toBe(listed);
		expect(range(html)).toBe(`1–${listed} din ${listed}`);
		await c.close();
		c = await startConsole(MEMBER, { empty: true });
		await c.signIn();
		const none = await page("/settings/blacklist");
		expect(none).not.toContain("data-listed=");
		expect(none).not.toContain('id="blacklist-pager"');
	});

	it("reminders: a day's page keeps its date in the address, and a page past the end is the last", async () => {
		c = await startConsole(MEMBER, { today: "2026-11-15" });
		await c.signIn();
		const day = (await c.port.reminders("psizone", "2026-11-16")).length;
		expect(day).toBeGreaterThan(0);
		const rows = (html: string): number => [...html.matchAll(/id="rem-([^"-]+)"/g)].length;
		const pages = Math.ceil(day / 25);
		const past = await page("/reminders?date=2026-11-16&page=7&size=25");
		expect(rows(past)).toBe(day - 25 * (pages - 1));
		expect(range(past)).toBe(`${25 * (pages - 1) + 1}–${day} din ${day}`);
		const body = await (await c.get("/reminders?date=2026-11-16&size=25", DATASTAR)).text();
		expect(body).toContain('"/reminders?date=2026-11-16&page=1&size=25"');
		expect(body).toContain('id="reminders-region"');
	});
});

describe("each list is refused to who may not see it, answering nothing of it", () => {
	it.each([
		["/requests?page=2&size=25", 'class="adm-card request"'],
		["/settings/blacklist?page=2&size=25", "data-listed="],
		["/reminders?date=2026-11-16&page=2&size=25", 'id="rem-state-'],
		["/settings/members?page=2&size=25", MEMBER_ROW],
	])("%s", async (path, row) => {
		c = await startConsole(MEMBER, {}, { [MEMBER.sub]: [{ app: "psizone", roles: ["nope"] }] });
		await c.signIn();
		const res = await c.get(path, DATASTAR);
		expect(res.status).toBe(403);
		expect(await res.text()).not.toContain(row);
	});
});
