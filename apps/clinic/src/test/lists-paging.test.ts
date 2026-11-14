import { afterEach, describe, expect, it } from "vitest";
import { LIST_PAGE } from "../port/port";
import { type Console, MEMBER, startConsole } from "./harness";

/**
 * The paged lists on the in-memory clinic: an empty list says so with no control, a list that fits one page has no
 * control, and each `…/more` route is refused to who may not see its list (nothing of the list is answered).
 */
let c: Console;
afterEach(() => c.close());

const DATASTAR = { headers: { "datastar-request": "true" } };
const controlOf = (html: string, path: string): boolean => html.includes(`${path}?`);

describe("one page, and empty", () => {
	it("requests: the five open ones fit one page, with no control", async () => {
		c = await startConsole(MEMBER);
		await c.signIn();
		const open = (await c.port.requests("psizone")).filter((r) => !r.handled).length;
		expect(open).toBeGreaterThan(0);
		expect(open).toBeLessThan(LIST_PAGE);
		const html = await (await c.get("/requests")).text();
		expect(html.split('class="adm-card request"').length - 1).toBe(open);
		expect(html).toContain(`(${open})`);
		expect(controlOf(html, "/requests/more")).toBe(false);
	});

	it("requests: none at all, the empty state and no control", async () => {
		c = await startConsole(MEMBER, { empty: true });
		await c.signIn();
		const html = await (await c.get("/requests")).text();
		expect(html).not.toContain('class="adm-card request"');
		expect(controlOf(html, "/requests/more")).toBe(false);
	});

	it("blacklist: the few listed fit one page, each named, with no control", async () => {
		c = await startConsole(MEMBER);
		await c.signIn();
		const listed = (await c.port.clientSummaries("psizone", "current", "")).filter(
			(s) => s.blacklist !== null,
		).length;
		expect(listed).toBeGreaterThan(0);
		const html = await (await c.get("/settings/blacklist")).text();
		expect(html.split("data-listed=").length - 1).toBe(listed);
		expect(controlOf(html, "/settings/blacklist/more")).toBe(false);
	});

	it("blacklist: no client listed, the empty state and no control", async () => {
		c = await startConsole(MEMBER, { empty: true });
		await c.signIn();
		const html = await (await c.get("/settings/blacklist")).text();
		expect(html).not.toContain("data-listed=");
		expect(controlOf(html, "/settings/blacklist/more")).toBe(false);
	});
});

describe("a list's next page is refused to who may not see the list", () => {
	it.each([
		"/requests/more?show=open&cursor=50&shown=50",
		"/settings/blacklist/more?cursor=50&shown=50",
		"/reminders/more?date=2026-11-16&cursor=50&shown=50",
		"/settings/audit/more?cursor=50&shown=50",
		"/clients/more?filter=current&cursor=50&shown=50",
	])("%s", async (path) => {
		c = await startConsole(MEMBER, {}, { [MEMBER.sub]: [{ app: "psizone", roles: ["nope"] }] });
		await c.signIn();
		const res = await c.get(path, DATASTAR);
		expect(res.status).toBe(403);
		expect(await res.text()).not.toContain("mode append");
	});
});
