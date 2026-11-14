import { describe, expect, it } from "vitest";
import {
	ACCOUNTANT,
	ADMIN,
	allPermissionKeys,
	CATALOGUE,
	COORDINATOR,
	can,
	effectivePermissions,
	isPermissionKey,
	OWNER,
	parsePermissionKey,
	RECEPTION,
	RELATION_NAME_MAX,
	RESOURCES,
	SEED_ROLES,
	seedEffective,
	THERAPIST,
	VOLUNTEER,
} from "../permissions";
import { scopeFactsFor } from "../permissions/relations";

const role = (name: string) => {
	const found = SEED_ROLES.find((r) => r.name === name);
	if (found === undefined) throw new Error(`no seed role ${name}`);
	// What the role holds in the end: its own keys and every role it includes.
	return { ...found, permissions: seedEffective(name) };
};
const perms = (name: string) => effectivePermissions([role(name)]);
const NONE = { own: false, assigned: false } as const;

describe("the catalogue", () => {
	it("has only legal OpenFGA relation names, all distinct, with room for a custom group", () => {
		const keys = allPermissionKeys();
		expect(new Set(keys).size).toBe(keys.length);
		const customSuffix = "_custom-".length + 12;
		for (const key of keys) {
			expect(key).toMatch(/^[a-z0-9_-]+$/);
			expect(key.length).toBeLessThanOrEqual(RELATION_NAME_MAX);
			const p = parsePermissionKey(key);
			if (p?.fieldGroup === undefined && p !== undefined && CATALOGUE[p.resource].fieldGroups) {
				expect(key.length + customSuffix).toBeLessThanOrEqual(RELATION_NAME_MAX);
			}
		}
	});

	it("covers every resource of the plan with at least one action", () => {
		// 32 of the plan, the Owner's own three (billing, the organisation, the assistants' budget), and the
		// availability editor's two: the practitioners' hours, stopping online booking
		expect(RESOURCES.length).toBe(37);
		for (const resource of RESOURCES) expect(CATALOGUE[resource].actions.length).toBeGreaterThan(0);
	});

	it("parses every key back to its structure, and custom field-group keys", () => {
		for (const key of allPermissionKeys()) expect(parsePermissionKey(key)).toBeDefined();
		expect(parsePermissionKey("clients_view_all_custom-school")).toMatchObject({
			resource: "clients",
			fieldGroup: "custom-school",
		});
	});

	it.each([
		"",
		"nothing",
		"clients_view_everywhere",
		"app_settings_delete_all",
		"clients_view_all_secret",
		"app_settings_view_all_custom-x",
		"clients_view_all_custom-",
		"clients_view_all_custom-UPPER",
		"clients_view_all_clinical_custom-x",
	])("rejects the non-key %j", (key) => {
		expect(isPermissionKey(key)).toBe(false);
	});
});

describe("effective permissions", () => {
	it("is the union of several roles", () => {
		const eff = effectivePermissions([role(VOLUNTEER), role(ACCOUNTANT)]);
		expect(eff.granted.has("roster_view_own")).toBe(true);
		expect(eff.granted.has("payments_view_all")).toBe(true);
	});

	it("adds personal grants and records personal denies apart", () => {
		const eff = effectivePermissions(
			[role(VOLUNTEER)],
			[
				{ permission: "web_requests_view_all", effect: "grant" },
				{ permission: "roster_view_own", effect: "deny" },
			],
		);
		expect(eff.granted.has("web_requests_view_all")).toBe(true);
		expect(eff.denied.has("roster_view_own")).toBe(true);
	});

	it("reports keys the catalogue no longer has and grants nothing for them", () => {
		const eff = effectivePermissions([
			{ name: "Old", permissions: ["gone_view_all", "roster_view_own"] },
		]);
		expect(eff.unknown).toEqual(["gone_view_all"]);
		expect(eff.granted.has("gone_view_all")).toBe(false);
	});

	it("no roles and no overrides grant nothing", () => {
		const eff = effectivePermissions([]);
		expect(eff.granted.size).toBe(0);
		expect(can(eff, "clients", "view", { ...NONE, fieldGroup: "contact" })).toEqual({
			allowed: false,
			reason: "not_granted",
		});
	});
});

describe("can: allowed", () => {
	it("all-scope grants pass whatever the relations", () => {
		expect(can(perms(RECEPTION), "appointments", "edit", { ...NONE, fieldGroup: "core" })).toEqual({
			allowed: true,
			scope: "all",
		});
	});

	it("own-scope grants pass when the thing is the person's own", () => {
		expect(can(perms(THERAPIST), "calendars", "view", { own: true, assigned: false })).toEqual({
			allowed: true,
			scope: "own",
		});
	});

	it("assigned-scope grants pass for an assigned practitioner's thing", () => {
		expect(can(perms(COORDINATOR), "calendars", "view", { own: false, assigned: true })).toEqual({
			allowed: true,
			scope: "assigned",
		});
	});

	it("a key without a field group grants identity only; each group needs its own key", () => {
		const identity = effectivePermissions([{ name: "R", permissions: ["clients_view_all"] }]);
		expect(can(identity, "clients", "view", NONE).allowed).toBe(true);
		for (const fieldGroup of [
			"contact",
			"guardian",
			"money",
			"clinical",
			"custom-school",
		] as const) {
			expect(can(identity, "clients", "view", { ...NONE, fieldGroup })).toEqual({
				allowed: false,
				reason: "field_group_not_granted",
			});
		}
		// The owner holds every explicit key, and so every group.
		const owner = effectivePermissions([role(OWNER)]);
		for (const fieldGroup of ["contact", "guardian", "money", "clinical"] as const) {
			expect(can(owner, "clients", "view", { ...NONE, fieldGroup }).allowed).toBe(true);
		}
		// A group key alone does not give identity.
		const groupOnly = effectivePermissions([
			{ name: "R", permissions: ["clients_view_all_contact"] },
		]);
		expect(can(groupOnly, "clients", "view", NONE)).toEqual({
			allowed: false,
			reason: "field_group_not_granted",
		});
	});

	it("a custom group is covered only when its own key is granted", () => {
		const eff = effectivePermissions([
			{ name: "R", permissions: ["clients_view_all_custom-school"] },
		]);
		expect(can(eff, "clients", "view", { ...NONE, fieldGroup: "custom-school" }).allowed).toBe(
			true,
		);
		expect(can(eff, "clients", "view", { ...NONE, fieldGroup: "custom-other" })).toEqual({
			allowed: false,
			reason: "field_group_not_granted",
		});
	});
});

describe("can: every refusal reason", () => {
	it("unknown_permission: an action the resource does not have", () => {
		expect(can(perms(OWNER), "roster", "delete", NONE)).toEqual({
			allowed: false,
			reason: "unknown_permission",
		});
	});

	it("unknown_permission: a field group on a resource without groups", () => {
		expect(can(perms(OWNER), "roster", "view", { ...NONE, fieldGroup: "clinical" })).toEqual({
			allowed: false,
			reason: "unknown_permission",
		});
	});

	it("unknown_permission: a built-in group the resource does not carry", () => {
		expect(can(perms(OWNER), "appointments", "view", { ...NONE, fieldGroup: "guardian" })).toEqual({
			allowed: false,
			reason: "unknown_permission",
		});
	});

	it("not_granted: nothing grants the action", () => {
		expect(can(perms(VOLUNTEER), "payments", "view", NONE)).toEqual({
			allowed: false,
			reason: "not_granted",
		});
	});

	it("field_group_not_granted: reception reads contact but not clinical", () => {
		expect(
			can(perms(RECEPTION), "clients", "view", { ...NONE, fieldGroup: "contact" }).allowed,
		).toBe(true);
		expect(can(perms(RECEPTION), "clients", "view", { ...NONE, fieldGroup: "clinical" })).toEqual({
			allowed: false,
			reason: "field_group_not_granted",
		});
	});

	it("field_group_not_granted: a therapist sees clinical of their clients but not money", () => {
		const facts = { own: true, assigned: false } as const;
		expect(
			can(perms(THERAPIST), "clients", "view", { ...facts, fieldGroup: "clinical" }).allowed,
		).toBe(true);
		expect(can(perms(THERAPIST), "clients", "view", { ...facts, fieldGroup: "money" })).toEqual({
			allowed: false,
			reason: "field_group_not_granted",
		});
	});

	it("no group named is identity only: reception has it, a role with only a group key does not", () => {
		expect(can(perms(RECEPTION), "clients", "view", NONE).allowed).toBe(true);
		const onlyGroup = effectivePermissions([
			{ name: "R", permissions: ["clients_view_all_contact"] },
		]);
		expect(can(onlyGroup, "clients", "view", NONE)).toEqual({
			allowed: false,
			reason: "field_group_not_granted",
		});
	});

	it("scope_not_met: a therapist on another therapist's calendar", () => {
		expect(can(perms(THERAPIST), "calendars", "view", NONE)).toEqual({
			allowed: false,
			reason: "scope_not_met",
		});
	});

	it("scope_not_met: a coordinator outside their assignments", () => {
		expect(can(perms(COORDINATOR), "clients", "view", { ...NONE, fieldGroup: "clinical" })).toEqual(
			{
				allowed: false,
				reason: "scope_not_met",
			},
		);
	});

	it("denied_by_override: deny wins over a role's grant", () => {
		const eff = effectivePermissions(
			[role(RECEPTION)],
			[{ permission: "clients_delete_all_contact", effect: "deny" }],
		);
		expect(can(eff, "clients", "delete", { ...NONE, fieldGroup: "contact" })).toEqual({
			allowed: false,
			reason: "denied_by_override",
		});
		expect(can(eff, "clients", "delete", { ...NONE, fieldGroup: "guardian" }).allowed).toBe(true);
	});

	it("denied_by_override: deny wins over a personal grant of the same key", () => {
		const eff = effectivePermissions(
			[],
			[
				{ permission: "payments_view_all", effect: "grant" },
				{ permission: "payments_view_all", effect: "deny" },
			],
		);
		expect(can(eff, "payments", "view", NONE)).toEqual({
			allowed: false,
			reason: "denied_by_override",
		});
	});

	it("denying the key without a group denies identity only, and a group key only that group", () => {
		const eff = effectivePermissions(
			[
				{
					name: "R",
					permissions: [
						"clients_view_all",
						"clients_view_all_clinical",
						"clients_view_all_contact",
					],
				},
			],
			[{ permission: "clients_view_all", effect: "deny" }],
		);
		expect(can(eff, "clients", "view", NONE)).toEqual({
			allowed: false,
			reason: "denied_by_override",
		});
		expect(can(eff, "clients", "view", { ...NONE, fieldGroup: "clinical" }).allowed).toBe(true);
		const group = effectivePermissions(
			[{ name: "R", permissions: ["clients_view_all", "clients_view_all_clinical"] }],
			[{ permission: "clients_view_all_clinical", effect: "deny" }],
		);
		expect(can(group, "clients", "view", NONE).allowed).toBe(true);
		expect(can(group, "clients", "view", { ...NONE, fieldGroup: "clinical" })).toEqual({
			allowed: false,
			reason: "denied_by_override",
		});
	});

	it("a deny of one scope leaves the grant of another that applies", () => {
		const eff = effectivePermissions(
			[{ name: "R", permissions: ["calendars_view_all", "calendars_view_own"] }],
			[{ permission: "calendars_view_all", effect: "deny" }],
		);
		expect(can(eff, "calendars", "view", { own: true, assigned: false }).allowed).toBe(true);
		expect(can(eff, "calendars", "view", NONE)).toEqual({
			allowed: false,
			reason: "scope_not_met",
		});
	});

	it("a personal grant lifts someone above their role", () => {
		const eff = effectivePermissions(
			[role(VOLUNTEER)],
			[{ permission: "web_requests_view_all", effect: "grant" }],
		);
		expect(can(eff, "web_requests", "view", NONE).allowed).toBe(true);
	});
});

describe("seed roles", () => {
	it("are the seven the plan names, with only catalogue keys", () => {
		expect(SEED_ROLES.map((r) => r.name)).toEqual([
			OWNER,
			ADMIN,
			RECEPTION,
			THERAPIST,
			COORDINATOR,
			VOLUNTEER,
			ACCOUNTANT,
		]);
		for (const r of SEED_ROLES) {
			expect(r.permissions.length).toBeGreaterThan(0);
			expect(r.permissions.every(isPermissionKey)).toBe(true);
			expect(new Set(r.permissions).size).toBe(r.permissions.length);
		}
	});

	it("Owner holds everything and Admin everything but roles and the audit log", () => {
		expect(new Set(role(OWNER).permissions)).toEqual(new Set(allPermissionKeys()));
		const admin = perms(ADMIN);
		expect(can(admin, "roles", "edit", NONE).allowed).toBe(false);
		expect(can(admin, "audit_log", "view", NONE).allowed).toBe(false);
		expect(can(admin, "members", "create", NONE).allowed).toBe(true);
		expect(can(admin, "clients", "view", { ...NONE, fieldGroup: "clinical" }).allowed).toBe(true);
	});

	it("Reception has no clinical access of any kind and can archive and delete clients", () => {
		const eff = perms(RECEPTION);
		for (const resource of [
			"report_aba",
			"report_racemeup",
			"report_psychotherapy",
			"questionnaire_parent",
			"files",
		] as const) {
			expect(can(eff, resource, "view", { own: true, assigned: true }).allowed).toBe(false);
		}
		expect(can(eff, "appointments", "view", { ...NONE, fieldGroup: "clinical" }).allowed).toBe(
			false,
		);
		expect(can(eff, "clients", "archive", { ...NONE, fieldGroup: "contact" }).allowed).toBe(true);
		expect(can(eff, "clients", "delete", { ...NONE, fieldGroup: "contact" }).allowed).toBe(true);
		expect(can(eff, "packages", "price", NONE).allowed).toBe(true);
		expect(can(eff, "roster", "edit", NONE).allowed).toBe(false);
	});

	it("Therapist: own things, no money, no roster edits, no other therapists", () => {
		const eff = perms(THERAPIST);
		const mine = { own: true, assigned: false } as const;
		expect(can(eff, "report_aba", "create", mine).allowed).toBe(true);
		expect(can(eff, "report_aba", "create", NONE).allowed).toBe(false);
		expect(can(eff, "appointments", "view", { ...mine, fieldGroup: "money" }).allowed).toBe(false);
		expect(can(eff, "payments", "view", mine).allowed).toBe(false);
		expect(can(eff, "leave", "create", mine).allowed).toBe(true);
		expect(can(eff, "leave", "approve", mine).allowed).toBe(false);
	});

	it("Accountant reads money and exports reports but changes nothing", () => {
		const eff = perms(ACCOUNTANT);
		expect(can(eff, "payments", "export", NONE).allowed).toBe(true);
		expect(can(eff, "reports", "export", NONE).allowed).toBe(true);
		expect(can(eff, "payments", "create", NONE).allowed).toBe(false);
		expect(can(eff, "clients", "view", { ...NONE, fieldGroup: "clinical" }).allowed).toBe(false);
		expect(can(eff, "clients", "edit", { ...NONE, fieldGroup: "contact" }).allowed).toBe(false);
	});

	it("Volunteer: own roster and leave only", () => {
		const eff = perms(VOLUNTEER);
		expect(can(eff, "roster", "view", { own: true, assigned: false }).allowed).toBe(true);
		expect(can(eff, "roster", "view", NONE).allowed).toBe(false);
		expect(
			can(eff, "clients", "view", { own: true, assigned: true, fieldGroup: "contact" }).allowed,
		).toBe(false);
	});
});

describe("scope relations as data", () => {
	const person = {
		subject: "sub-1",
		practitionerId: "p1",
		assignedPractitionerIds: new Set(["p2"]),
	};

	it("self: their own practitioner row", () => {
		expect(scopeFactsFor(person, { practitionerId: "p1" })).toEqual({ own: true, assigned: false });
	});

	it("treating: a client they treat is own, even with other practitioners on it", () => {
		expect(scopeFactsFor(person, { treatedBy: ["p9", "p1"] }, "clinical")).toEqual({
			own: true,
			assigned: false,
			fieldGroup: "clinical",
		});
	});

	it("assigned_to: a coordinator's practitioner", () => {
		expect(scopeFactsFor(person, { practitionerId: "p2" })).toEqual({ own: false, assigned: true });
		expect(scopeFactsFor(person, { treatedBy: ["p2"] })).toEqual({ own: false, assigned: true });
	});

	it("an owner subject (own leave) and a stranger", () => {
		expect(scopeFactsFor(person, { ownerSubject: "sub-1" }).own).toBe(true);
		expect(scopeFactsFor(person, { practitionerId: "p9", ownerSubject: "sub-2" })).toEqual({
			own: false,
			assigned: false,
		});
		expect(
			scopeFactsFor({ subject: "x", assignedPractitionerIds: new Set() }, { practitionerId: "p1" })
				.own,
		).toBe(false);
	});
});
