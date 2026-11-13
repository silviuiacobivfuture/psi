import { afterAll, describe, expect, it } from "vitest";
import { type Console, MEMBER, startConsole } from "./harness";

const href = (html: string, h: string): boolean => html.includes(`href="${h}"`);
const open: Console[] = [];
afterAll(async () => {
	for (const c of open) await c.close();
});
async function as(roles: string[], platform = false): Promise<Console> {
	const c = await startConsole(MEMBER, platform ? { platformAdmins: new Set([MEMBER.sub]) } : {}, {
		[MEMBER.sub]: [{ app: "psizone", roles }],
	});
	await c.signIn();
	open.push(c);
	return c;
}
const text = async (r: Response): Promise<string> => await r.text();

describe("the three kinds of settings", () => {
	it("reception: her own settings, and only the organisation areas she holds", async () => {
		const c = await as(["reception"]);
		const nav = await text(await c.get("/clients"));
		expect(href(nav, "/me/settings")).toBe(true);
		expect(href(nav, "/platform")).toBe(false);
		expect((await c.get("/me/settings")).status).toBe(200);
		const landing = await text(await c.get("/settings"));
		expect(landing).toContain('data-subnav="blacklist"');
		expect(landing).not.toContain('data-subnav="roles"');
		expect(landing).not.toContain('data-subnav="audit"');
		expect((await c.get("/settings/roles")).status).toBe(403);
		expect((await c.get("/settings/audit")).status).toBe(403);
		expect((await c.get("/platform")).status).toBe(403);
		expect((await c.get("/settings/blacklist")).status).toBe(200);
	});
	it("an accountant holds no organisation setting and still has her own", async () => {
		const c = await as(["accountant"]);
		expect(href(await text(await c.get("/requests")), "/settings")).toBe(false);
		expect((await c.get("/settings")).status).toBe(403);
		expect((await c.get("/me/settings")).status).toBe(200);
	});
	it("the owner sees the organisation's areas, not the platform", async () => {
		const c = await as(["owner"]);
		const landing = await text(await c.get("/settings"));
		for (const id of ["roles", "people", "services", "builder", "audit", "blacklist", "import"])
			expect(landing, id).toContain(`data-subnav="${id}"`);
		expect((await c.get("/platform")).status).toBe(403);
	});
	it("a platform administrator has the platform, set apart at the foot of the navigation", async () => {
		const c = await as(["owner"], true);
		const nav = await text(await c.get("/clients"));
		expect(href(nav, "/platform")).toBe(true);
		expect(nav).toContain("adm-nav__admin");
		const page = await text(await c.get("/platform"));
		expect(page).toContain('data-org="psizone"');
		expect(page).toContain('data-org="hemisync"');
	});
	it("the old addresses lead to the new ones", async () => {
		const c = await as(["owner"]);
		const end = async (path: string): Promise<string | undefined> =>
			(await c.browser.go(`${c.origin}${path}`)).trail.at(-1);
		expect(await end("/admin")).toBe(`${c.origin}/settings`);
		expect(await end("/audit")).toBe(`${c.origin}/settings/audit`);
		expect(await end("/settings/notifications")).toBe(`${c.origin}/me/settings`);
	});
});
