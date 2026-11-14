import { SEED_ROLES } from "@psi/scheduling/permissions";
import type { RoleRow } from "@psi/scheduling-api/store-types";
import { describe, expect, it } from "vitest";
import { planReseed, seedRolesOf } from "./plan";

const role = (id: string, name: string, system: boolean, permissions: string[] = []): RoleRow => ({
	id,
	app: "a",
	name,
	system,
	permissions,
	includes: [],
	createdAt: 0,
	updatedAt: 0,
});
/** Every seed role, stored as the seed holds it, flagged or not. */
const seedSet = (system: boolean, rename: Record<string, string> = {}): RoleRow[] =>
	SEED_ROLES.map((s) => role(`id-${s.name}`, rename[s.name] ?? s.name, system, [...s.permissions]));

describe("which stored role is each seed role", () => {
	it("the system role of the seed's name", () => {
		const found = seedRolesOf(seedSet(true));
		expect([...found.keys()].sort()).toEqual(SEED_ROLES.map((s) => s.name).sort());
	});

	it("roles written through the store (unflagged) are adopted by name, so a re-seed reaches them", () => {
		const found = seedRolesOf(seedSet(false));
		expect(found.size).toBe(SEED_ROLES.length);
		expect(planReseed(seedSet(false), 1).some((s) => s.kind === "missing")).toBe(false);
	});

	it("the Admin seed role stored as 'Administrator' (the console's name) is adopted, case ignored", () => {
		expect(seedRolesOf(seedSet(true, { Admin: "Administrator" })).get("Admin")?.id).toBe(
			"id-Admin",
		);
		expect(seedRolesOf(seedSet(false, { Admin: "administrator" })).get("Admin")?.id).toBe(
			"id-Admin",
		);
	});

	it("a system role wins over an unflagged one of the same seed (an app holding both Admin and Administrator)", () => {
		const roles = [...seedSet(false), role("sys-admin", "Admin", true)];
		const both = roles
			.filter((r) => r.id !== "id-Admin")
			.concat(role("custom-admin", "Administrator", false));
		expect(seedRolesOf(both).get("Admin")?.id).toBe("sys-admin");
	});

	it("two unflagged candidates for one seed role adopt neither: it stays missing, nothing is guessed", () => {
		const roles = seedSet(false).concat(role("other", "Administrator", false));
		expect(seedRolesOf(roles).has("Admin")).toBe(false);
		expect(planReseed(roles, 1)).toContainEqual({ kind: "missing", name: "Admin" });
	});

	it("a role of another name is never taken for a seed role", () => {
		const roles = seedSet(false)
			.filter((r) => r.name !== "Owner")
			.concat(role("x", "Proprietar custom", false));
		expect(seedRolesOf(roles).has("Owner")).toBe(false);
	});
});
