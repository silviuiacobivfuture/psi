import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Console, MEMBER, startConsole } from "./harness";

/** The members' screen over the in-memory clinic (the demo): the same rules the service keeps. */
let owner: Console;
beforeAll(async () => {
	owner = await startConsole(
		MEMBER,
		// the estate administrator: the only one who may ask what a role or member holds
		{ today: "2026-11-16", platformAdmins: new Set([MEMBER.sub]) },
		{
			[MEMBER.sub]: [{ app: "psizone", roles: ["owner"] }],
			iuliana: [{ app: "psizone", roles: ["reception"] }],
		},
	);
	await owner.signIn();
});
afterAll(async () => {
	await owner.close();
});

const form = { "content-type": "application/x-www-form-urlencoded" };
const post = (path: string, values: [string, string][]) =>
	owner.post(path, new URLSearchParams(values), form);
const page = async (path: string): Promise<string> => (await owner.get(path)).text();

describe("the members' screen on the in-memory clinic", () => {
	it("shows each member with their role, and the editor with the summary of what they may do", async () => {
		const list = await page("/settings/members");
		expect(list).toContain('data-member="iuliana"');
		expect(list).toContain("Recepție");
		const editor = await page("/settings/members?edit=iuliana");
		expect(editor).toContain('data-member-editor="iuliana"');
		expect(editor).toContain("Ce poate face, în total");
		expect(editor).toContain("Permisiuni în plus");
		expect(editor).toContain("Permisiuni retrase");
	});

	it("a second role adds up; dropping it leaves the first", async () => {
		await post("/settings/members/iuliana/save", [
			["displayName", "Iuliana"],
			["roles", "reception"],
			["roles", "accountant"],
		]);
		const both = await owner.port.member("psizone", "iuliana");
		expect(both?.roles).toEqual(["reception", "accountant"]);
		const caps = await owner.port.capabilities(MEMBER.sub, "psizone", "member:iuliana");
		const reception = await owner.port.capabilities(MEMBER.sub, "psizone", "role:reception");
		const accountant = await owner.port.capabilities(MEMBER.sub, "psizone", "role:accountant");
		for (const k of [...Object.keys(reception.permissions), ...Object.keys(accountant.permissions)])
			expect(Object.hasOwn(caps.permissions, k), k).toBe(true);
		await post("/settings/members/iuliana/save", [
			["displayName", "Iuliana"],
			["roles", "reception"],
		]);
		const one = await owner.port.capabilities(MEMBER.sub, "psizone", "member:iuliana");
		for (const k of Object.keys(reception.permissions))
			expect(Object.hasOwn(one.permissions, k), k).toBe(true);
		const accountantOnly = Object.keys(accountant.permissions).filter(
			(k) => !Object.hasOwn(reception.permissions, k),
		);
		for (const k of accountantOnly) expect(Object.hasOwn(one.permissions, k), k).toBe(false);
	});

	it("a withdrawn permission beats an extra one of the same kind", async () => {
		await post("/settings/members/iuliana/overrides", [
			["grant", "audit_log_view_all"],
			["deny", "audit_log_view"],
		]);
		const caps = await owner.port.capabilities(MEMBER.sub, "psizone", "member:iuliana");
		expect(caps.permissions.audit_log_view).toBeUndefined();
		await post("/settings/members/iuliana/overrides", [["grant", "audit_log_view_all"]]);
		const granted = await owner.port.capabilities(MEMBER.sub, "psizone", "member:iuliana");
		expect(granted.permissions.audit_log_view).toEqual(["all"]);
	});

	it("refuses one's own membership, writing nothing", async () => {
		const before = await owner.port.member("psizone", MEMBER.sub);
		const r = await post(`/settings/members/${MEMBER.sub}/save`, [["displayName", "Eu"]]);
		expect(r.status).toBe(403);
		expect(await owner.port.member("psizone", MEMBER.sub)).toEqual(before);
	});
});
