import { afterEach, describe, expect, it } from "vitest";
import { type Console, MEMBER, startConsole } from "./harness";

let c: Console;
afterEach(() => c.close());

const open = async (platformAdmin: boolean): Promise<Console> => {
	c = await startConsole(MEMBER, platformAdmin ? { platformAdmins: new Set([MEMBER.sub]) } : {});
	await c.signIn();
	return c;
};

describe("the platform administrator", () => {
	it("is told in the pill first as the system's administrator, then by the clinic role, and the menu names the person", async () => {
		await open(true);
		const html = await (await c.get("/calendar")).text();
		expect(html).toMatch(/Rol: Administrator sistem · [^<]+/);
		expect(html).not.toContain("Administrator platformă");
		expect(html).toContain("Ana Test");
		expect(html).not.toContain("Recepție Demo");
	});
	it("is first in the picker, then the app's roles, then the people", async () => {
		await open(true);
		const menu = await (await c.get("/view-as/menu")).text();
		const platform = menu.indexOf("data-view-as-platform");
		const roles = menu.indexOf('data-view-as-choice="role:');
		const people = menu.indexOf('data-view-as-choice="member:');
		expect(platform).toBeGreaterThan(-1);
		// Two levels, each under its own heading: the platform's one role, then the organisation's.
		const platformHead = menu.indexOf("Platformă");
		const orgHead = menu.indexOf("Organizație");
		expect(platformHead).toBeGreaterThan(-1);
		expect(platformHead).toBeLessThan(platform);
		expect(orgHead).toBeGreaterThan(platform);
		expect(orgHead).toBeLessThan(roles);
		expect(platform).toBeLessThan(roles);
		expect(roles).toBeLessThan(people);
		expect(await (await c.get("/view-as")).text()).toContain("data-view-as-platform");
	});
	it("is the only one offered that entry: an owner who is not the platform's administrator sees roles and people only", async () => {
		await open(false);
		const html = await (await c.get("/view-as")).text();
		expect(html).not.toContain("data-view-as-platform");
		expect(html).not.toContain("Platformă</h2>");
		expect(html).toContain("Organizație</h2>");
		expect(await (await c.get("/calendar")).text()).toContain("Rol: Proprietar");
	});
	it("the install entry is a row of the menu, like its neighbours", async () => {
		await open(false);
		const html = await (await c.get("/calendar")).text();
		expect(html).not.toContain("pz-btn");
		expect(html).toContain('class="adm-menu__item"');
	});
});
