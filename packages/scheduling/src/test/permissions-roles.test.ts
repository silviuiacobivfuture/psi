import { describe, expect, it } from "vitest";
import {
	ALL_PERMISSION_KEYS,
	allPermissionKeys,
	CATALOGUE,
	isPermissionKey,
	RELATION_NAME_MAX,
	RESOURCES,
	recordResourceFor,
	relationName,
	SEED_ROLES,
} from "../permissions";

/**
 * The exact grants of every seed role, written out here independently of the code that builds
 * them. Notation: [resource, actions, scope, groups]. On a resource with field groups the key
 * without a group (identity: name, status, ids) is always granted with the groups listed.
 */
type Spec = ReadonlyArray<readonly [string, string, string, string?]>;

const expand = (spec: Spec): string[] => {
	const keys = new Set<string>();
	for (const [resource, actions, scope, groups] of spec) {
		for (const action of actions.split(" ")) {
			keys.add(`${resource}_${action}_${scope}`);
			for (const g of groups === undefined ? [] : groups.split(" ")) {
				keys.add(`${resource}_${action}_${scope}_${g}`);
			}
		}
	}
	return [...keys].sort();
};

const VIEW_CATALOGUES: Spec = [
	["services", "view", "all"],
	["rooms", "view", "all"],
	["devices", "view", "all"],
	["group_activities", "view", "all"],
	["notice_board", "view", "all"],
];

const EXPECTED: Record<string, string[]> = {
	Reception: expand([
		...VIEW_CATALOGUES,
		["prices", "view", "all"],
		["people", "view", "all"],
		["calendars", "view edit assign", "all"],
		["appointments", "view create edit cancel assign send", "all", "core money"],
		["clients", "view create edit archive delete assign", "all", "contact guardian money"],
		["packages", "view create edit price", "all"],
		["payments", "view create edit", "all"],
		["reminders", "view send", "all"],
		["web_requests", "view approve", "all"],
		["roster", "view", "all"],
		["leave", "view", "all"],
		["notice_board", "create edit", "all"],
	]),
	Therapist: expand([
		...VIEW_CATALOGUES,
		["calendars", "view", "own"],
		["appointments", "view create edit cancel", "own", "core clinical"],
		["clients", "view", "own", "contact guardian clinical"],
		["clients", "edit", "own", "clinical"],
		["report_aba", "view create edit", "own"],
		["report_racemeup", "view create edit", "own"],
		["report_psychotherapy", "view create edit", "own"],
		["report_custom", "view create edit", "own"],
		["questionnaire_parent", "view", "own"],
		["files", "view upload", "own"],
		["reminders", "view send", "own"],
		["roster", "view", "own"],
		["leave", "view create cancel", "own"],
	]),
	Coordinator: expand([
		...VIEW_CATALOGUES,
		["calendars", "view", "assigned"],
		["appointments", "view edit", "assigned", "core clinical"],
		["clients", "view", "assigned", "contact guardian clinical"],
		["report_aba", "view", "assigned"],
		["report_racemeup", "view", "assigned"],
		["report_psychotherapy", "view", "assigned"],
		["report_custom", "view", "assigned"],
		["questionnaire_parent", "view", "assigned"],
		["reminders", "view", "assigned"],
		["roster", "view", "assigned"],
		["leave", "view approve", "assigned"],
	]),
	Volunteer: expand([
		["notice_board", "view", "all"],
		["roster", "view", "own"],
		["leave", "view create cancel", "own"],
	]),
	Accountant: expand([
		["services", "view", "all"],
		["prices", "view", "all"],
		["appointments", "view", "all", "core money"],
		["clients", "view", "all", "contact money"],
		["packages", "view", "all"],
		["payments", "view export", "all"],
		["reports", "view export", "all"],
	]),
};

const grants = (name: string): string[] => {
	const found = SEED_ROLES.find((r) => r.name === name);
	if (found === undefined) throw new Error(name);
	return [...found.permissions].sort();
};

describe("every seed role's exact grants", () => {
	it.each(Object.keys(EXPECTED))("%s", (name) => {
		expect(grants(name)).toEqual(EXPECTED[name]);
	});

	it("Owner holds every key; Admin every key but roles and the audit log", () => {
		expect(grants("Owner")).toEqual([...ALL_PERMISSION_KEYS].sort());
		expect(grants("Admin")).toEqual(
			[...ALL_PERMISSION_KEYS].filter((k) => !/^(roles|audit_log)_/.test(k)).sort(),
		);
	});

	it("only the owner and the admin may restore, run imports or delete records", () => {
		for (const name of ["Reception", "Therapist", "Coordinator", "Volunteer", "Accountant"]) {
			expect(grants(name).filter((k) => /_(restore|imports_run|imports_view)_/.test(k))).toEqual(
				[],
			);
		}
	});

	it("the money group is never held by a therapist, a coordinator or a volunteer; clinical never by reception or an accountant", () => {
		for (const name of ["Therapist", "Coordinator", "Volunteer"]) {
			expect(grants(name).filter((k) => k.endsWith("_money"))).toEqual([]);
		}
		for (const name of ["Reception", "Accountant"]) {
			expect(grants(name).filter((k) => k.endsWith("_clinical"))).toEqual([]);
		}
	});
});

describe("the catalogue's new resources, actions and helpers", () => {
	it("people: view, create, edit, archive at all or own", () => {
		expect(CATALOGUE.people.actions).toEqual(["view", "create", "edit", "archive"]);
		expect(CATALOGUE.people.scopes).toEqual(["all", "own"]);
		expect(isPermissionKey("people_archive_own")).toBe(true);
		expect(isPermissionKey("people_archive_assigned")).toBe(false);
	});

	it("payments at all, assigned and own; restore on clients and appointments; upload on files; imports actions", () => {
		expect(CATALOGUE.payments.scopes).toEqual(["all", "assigned", "own"]);
		for (const key of [
			"payments_view_assigned",
			"clients_restore_all_contact",
			"appointments_restore_own",
			"files_upload_own",
			"imports_exports_imports_view_all",
			"imports_exports_imports_run_all",
		]) {
			expect(isPermissionKey(key)).toBe(true);
		}
		expect(isPermissionKey("files_create_own")).toBe(false);
		expect(isPermissionKey("packages_restore_all")).toBe(false);
	});

	it("records stay per report kind, with report_custom for the builder's forms", () => {
		expect(recordResourceFor("aba-session-report")).toBe("report_aba");
		expect(recordResourceFor("race-me-up-report")).toBe("report_racemeup");
		expect(recordResourceFor("psychotherapy-report")).toBe("report_psychotherapy");
		expect(recordResourceFor("parent-questionnaire")).toBe("questionnaire_parent");
		expect(recordResourceFor("anything-an-owner-built")).toBe("report_custom");
		expect(recordResourceFor("")).toBe("report_custom");
		for (const r of [
			"report_aba",
			"report_racemeup",
			"report_psychotherapy",
			"report_custom",
			"questionnaire_parent",
		]) {
			expect(RESOURCES).toContain(r);
		}
	});

	it("the full key list is the one source: complete, unique, and each key a legal relation name", () => {
		expect(ALL_PERMISSION_KEYS).toEqual(allPermissionKeys());
		expect(new Set(ALL_PERMISSION_KEYS).size).toBe(ALL_PERMISSION_KEYS.length);
		for (const key of ALL_PERMISSION_KEYS) {
			expect(relationName(key)).toBe(key);
			expect(key.length).toBeLessThanOrEqual(RELATION_NAME_MAX);
		}
	});

	it("relationName accepts a custom group key and refuses what is not a key", () => {
		expect(relationName("clients_view_all_custom-school")).toBe("clients_view_all_custom-school");
		for (const bad of [
			"",
			"nothing",
			"clients_view_everywhere",
			"Clients_view_all",
			"clients view all",
		]) {
			expect(() => relationName(bad)).toThrow(RangeError);
		}
	});
});
