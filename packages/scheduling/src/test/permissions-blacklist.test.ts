import { describe, expect, it } from "vitest";
import {
	ACCOUNTANT,
	ADMIN,
	CATALOGUE,
	COORDINATOR,
	can,
	effectivePermissions,
	isPermissionKey,
	OWNER,
	RECEPTION,
	SEED_ROLES,
	THERAPIST,
	VOLUNTEER,
} from "../permissions";

const perms = (name: string) => {
	const role = SEED_ROLES.find((r) => r.name === name);
	if (role === undefined) throw new Error(name);
	return effectivePermissions([role]);
};
const NONE = { own: false, assigned: false } as const;

describe("the blacklist in the catalogue", () => {
	it("has CRUD, the warn-level create and the two overrides, all-scope only", () => {
		expect(CATALOGUE.blacklist.actions).toEqual([
			"view",
			"create",
			"edit",
			"delete",
			"create_warn",
			"override",
			"override_admin",
		]);
		expect(CATALOGUE.blacklist.scopes).toEqual(["all"]);
		for (const key of [
			"blacklist_view_all",
			"blacklist_create_warn_all",
			"blacklist_override_all",
			"blacklist_override_admin_all",
		]) {
			expect(isPermissionKey(key)).toBe(true);
		}
		expect(isPermissionKey("blacklist_view_own")).toBe(false);
	});

	it("Owner and Admin hold all of it", () => {
		for (const name of [OWNER, ADMIN]) {
			for (const action of CATALOGUE.blacklist.actions) {
				expect(can(perms(name), "blacklist", action, NONE).allowed, `${name} ${action}`).toBe(true);
			}
		}
	});

	it("Reception views and flags at warn level, and nothing else", () => {
		const eff = perms(RECEPTION);
		expect(can(eff, "blacklist", "view", NONE).allowed).toBe(true);
		expect(can(eff, "blacklist", "create_warn", NONE).allowed).toBe(true);
		for (const action of ["create", "edit", "delete", "override", "override_admin"] as const) {
			expect(can(eff, "blacklist", action, NONE), action).toEqual({
				allowed: false,
				reason: "not_granted",
			});
		}
	});

	it("no other seed role touches it", () => {
		for (const name of [THERAPIST, COORDINATOR, VOLUNTEER, ACCOUNTANT]) {
			for (const action of CATALOGUE.blacklist.actions) {
				expect(can(perms(name), "blacklist", action, NONE).allowed, `${name} ${action}`).toBe(
					false,
				);
			}
		}
	});
});

describe("feedback in the catalogue", () => {
	it("has view, reply, close, with core and contact field groups", () => {
		expect(CATALOGUE.feedback.actions).toEqual(["view", "reply", "close"]);
		expect(CATALOGUE.feedback.fieldGroups).toEqual(["core", "contact"]);
		expect(isPermissionKey("feedback_view_all_contact")).toBe(true);
		expect(isPermissionKey("feedback_reply_all_core")).toBe(true);
	});

	it("Reception handles it with text and contact; Accountant, Therapist and the rest see none", () => {
		const eff = perms(RECEPTION);
		for (const action of ["view", "reply", "close"] as const) {
			expect(can(eff, "feedback", action, NONE).allowed).toBe(true);
			expect(can(eff, "feedback", action, { ...NONE, fieldGroup: "contact" }).allowed).toBe(true);
		}
		for (const name of [THERAPIST, COORDINATOR, VOLUNTEER, ACCOUNTANT]) {
			expect(can(perms(name), "feedback", "view", NONE).allowed, name).toBe(false);
		}
	});

	it("a key without the contact group reads the item but not who wrote it", () => {
		const eff = effectivePermissions([
			{
				name: "x",
				permissions: ["feedback_view_all", "feedback_view_all_core"],
			},
		]);
		expect(can(eff, "feedback", "view", { ...NONE, fieldGroup: "core" }).allowed).toBe(true);
		expect(can(eff, "feedback", "view", { ...NONE, fieldGroup: "contact" })).toEqual({
			allowed: false,
			reason: "field_group_not_granted",
		});
	});
});

describe("reports in the catalogue: money is its own group", () => {
	it("Accountant reads and exports core and money; Reception reads no report", () => {
		const eff = perms(ACCOUNTANT);
		for (const fieldGroup of ["core", "money"] as const) {
			expect(can(eff, "reports", "view", { ...NONE, fieldGroup }).allowed).toBe(true);
			expect(can(eff, "reports", "export", { ...NONE, fieldGroup }).allowed).toBe(true);
		}
		expect(can(perms(RECEPTION), "reports", "view", NONE).allowed).toBe(false);
	});

	it("a core-only key does not open the money group", () => {
		const eff = effectivePermissions([
			{ name: "x", permissions: ["reports_view_all", "reports_view_all_core"] },
		]);
		expect(can(eff, "reports", "view", { ...NONE, fieldGroup: "money" })).toEqual({
			allowed: false,
			reason: "field_group_not_granted",
		});
	});
});
