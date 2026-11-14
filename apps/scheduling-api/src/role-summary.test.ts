import { RoleSummary } from "@psi/scheduling-sdk/contract";
import { beforeEach, describe, expect, it } from "vitest";
import { createWorld, PEOPLE, type Populated } from "./testing/populate";

const A = "/v1/apps/psizone";
let w: Populated;
beforeEach(async () => {
	w = await createWorld();
});
const as = (who: string | null, method: string, path: string, body?: unknown) =>
	w.call(who, method, `${A}${path}`, body);
const summary = async (who: string) => {
	const r = await as(who, "GET", "/role-summary");
	expect(r.status, JSON.stringify(r.json)).toBe(200);
	return RoleSummary.parse(r.json);
};

describe("roles.summary: the roles every member may compare", () => {
	it("every member reads it, whatever their role, while the role editor's list stays refused", async () => {
		for (const who of Object.keys(PEOPLE)) {
			const got = await summary(who);
			expect(got.roles.length, who).toBe(7);
		}
		expect((await as("rita", "GET", "/roles")).status).toBe(403);
	});

	it("a member who holds no role at all reads it too", async () => {
		await as("olga", "PUT", "/members/blankish", {
			displayName: "Blank",
			roles: [],
			coordinates: [],
		});
		expect((await summary("blankish")).roles.length).toBe(7);
	});

	it("is the roles' stored keys, exactly what the role editor reads", async () => {
		const got = await summary("rita");
		for (const r of got.roles) {
			const stored = (await as("olga", "GET", `/roles/${r.id}`)).json.role as {
				name: string;
				permissions: string[];
			};
			expect(r.name).toBe(stored.name);
			expect(r.permissions).toEqual([...stored.permissions].sort());
		}
	});

	it("follows an edit at once: a permission added to a role is in the summary, and gone when removed", async () => {
		const id = w.ids.roles.reception ?? "";
		const before = (await summary("rita")).roles.find((r) => r.id === id)?.permissions ?? [];
		expect(before).not.toContain("builder_view_all");
		await as("olga", "PUT", `/roles/${id}/permissions`, {
			permissions: [...before, "builder_view_all"],
		});
		expect((await summary("rita")).roles.find((r) => r.id === id)?.permissions).toContain(
			"builder_view_all",
		);
		await as("olga", "PUT", `/roles/${id}/permissions`, { permissions: before });
		expect((await summary("rita")).roles.find((r) => r.id === id)?.permissions).toEqual(before);
	});

	it("a custom role appears with its keys, and nothing about who holds it", async () => {
		const made = (await as("olga", "POST", "/roles", { name: "Stagiar" })).json.id as string;
		await as("olga", "PUT", `/roles/${made}/permissions`, { permissions: ["clients_view_own"] });
		const raw = (await as("rita", "GET", "/role-summary")).json;
		const role = RoleSummary.parse(raw).roles.find((r) => r.id === made);
		expect(role).toEqual({
			id: made,
			name: "Stagiar",
			system: false,
			permissions: ["clients_view_own"],
			includes: [],
			inherited: {},
		});
		// No member list, no counts, no stamps: only names and keys leave.
		const text = JSON.stringify(raw);
		for (const subject of Object.keys(PEOPLE)) expect(text).not.toContain(`"${subject}"`);
		for (const field of ["members", "createdAt", "updatedAt", "subject", "displayName"])
			expect(text).not.toContain(`"${field}"`);
	});

	it("names what the platform administrator holds: settings, team and roles, and nothing clinical", async () => {
		const { platform } = await summary("rita");
		expect(platform.permissions).toContain("roles_edit_all");
		expect(platform.permissions).toContain("members_view_all");
		expect(platform.permissions).toContain("app_settings_edit_all");
		// and the organisation itself, so one whose last Owner left can be handed over; never billing or the budget
		expect(platform.permissions).toContain("organisation_transfer_all");
		for (const p of platform.permissions)
			expect(p, p).toMatch(/^(app_settings|members|roles|organisation)_/);
	});

	it("is refused, and writes nothing, to a member of another app and to a stranger", async () => {
		expect((await as("hugo", "GET", "/role-summary")).status).toBe(404);
		expect((await as("mallory", "GET", "/role-summary")).status).toBe(404);
		expect((await as(null, "GET", "/role-summary")).status).toBe(401);
	});
});
