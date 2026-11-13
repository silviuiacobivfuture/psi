import type { FieldGroupName, SchedType, ScopeName } from "@psi/scheduling-sdk/contract";

/**
 * THE PERMISSION CATALOGUE (docs/plans/clinic.md section 4): resource x action x scope, optionally x field group.
 * The OpenFGA model, the manifest, the role matrix and the route table's permission keys are all generated from or
 * checked against it, so they cannot drift.
 *
 * PLACEHOLDER: packages/scheduling/src/domain is to export the real catalogue (branch clinic/model2). Until it is
 * there this module holds the same shape; when it lands, this file becomes a re-export and nothing else changes.
 */
export interface PermissionDef {
	/** `clients_edit`. A scoped permission is held as `<key>_all`, `<key>_assigned`, `<key>_own` on the app. */
	key: string;
	resource: string;
	action: string;
	effect: "read" | "write";
	/** Empty: held on the app, with no scope. */
	scopes: readonly ScopeName[];
	/** The object types a Check of this permission is made on (a scoped permission is defined on each). */
	objects: readonly SchedType[];
	fieldGroup?: FieldGroupName;
	/** The estate's platform administrators hold it in every app (apps, members, roles). */
	platformAdmin?: true;
}

const ALL: readonly ScopeName[] = ["all", "assigned", "own"];
const NONE: readonly ScopeName[] = [];

type Row = readonly [
	resource: string,
	action: string,
	effect: "read" | "write",
	scopes: readonly ScopeName[],
	objects: readonly SchedType[],
	extra?: { fieldGroup?: FieldGroupName; platformAdmin?: true },
];

const app = ["sched_app"] as const;
const rows: readonly Row[] = [
	["app_settings", "view", "read", NONE, app, { platformAdmin: true }],
	["app_settings", "edit", "write", NONE, app, { platformAdmin: true }],
	["members", "view", "read", NONE, app, { platformAdmin: true }],
	["members", "edit", "write", NONE, app, { platformAdmin: true }],
	["members", "remove", "write", NONE, app, { platformAdmin: true }],
	["roles", "view", "read", NONE, app, { platformAdmin: true }],
	["roles", "create", "write", NONE, app, { platformAdmin: true }],
	["roles", "edit", "write", NONE, app, { platformAdmin: true }],
	["roles", "delete", "write", NONE, app, { platformAdmin: true }],
	...(["people", "rooms", "devices", "groups", "services"] as const).flatMap((r): Row[] => [
		[r, "view", "read", NONE, app],
		[r, "create", "write", NONE, app],
		[r, "edit", "write", NONE, app],
		[r, "delete", "write", NONE, app],
	]),
	["prices", "view", "read", NONE, app, { fieldGroup: "money" }],
	["prices", "change", "write", NONE, app, { fieldGroup: "money" }],
	["calendar", "view", "read", ALL, ["sched_calendar"]],
	["appointments", "view", "read", ALL, ["sched_appointment"]],
	["appointments", "create", "write", ALL, ["sched_calendar"]],
	["appointments", "edit", "write", ALL, ["sched_appointment"]],
	["appointments", "cancel", "write", ALL, ["sched_appointment"]],
	["appointments", "attend", "write", ALL, ["sched_appointment"]],
	["appointments", "assign", "write", ALL, ["sched_appointment"]],
	["appointments", "money_view", "read", ALL, ["sched_appointment"], { fieldGroup: "money" }],
	["appointments", "money_edit", "write", ALL, ["sched_appointment"], { fieldGroup: "money" }],
	["clients", "create", "write", NONE, app],
	...(["view", "edit", "archive", "restore", "delete", "assign", "export"] as const).map(
		(a): Row => [
			"clients",
			a,
			a === "view" || a === "export" ? "read" : "write",
			ALL,
			["sched_client"],
		],
	),
	...(["contact", "guardian", "money", "clinical"] as const).flatMap((g): Row[] => [
		["clients", `${g}_view`, "read", ALL, ["sched_client"], { fieldGroup: g }],
		["clients", `${g}_edit`, "write", ALL, ["sched_client"], { fieldGroup: g }],
	]),
	["packages", "view", "read", ALL, ["sched_client", "sched_package"], { fieldGroup: "money" }],
	["packages", "create", "write", ALL, ["sched_client"], { fieldGroup: "money" }],
	["packages", "edit", "write", ALL, ["sched_package"], { fieldGroup: "money" }],
	["packages", "delete", "write", ALL, ["sched_package"], { fieldGroup: "money" }],
	["payments", "view", "read", ALL, ["sched_package"], { fieldGroup: "money" }],
	["payments", "create", "write", ALL, ["sched_package"], { fieldGroup: "money" }],
	["payments", "delete", "write", NONE, app, { fieldGroup: "money" }],
	["roster", "view", "read", NONE, app],
	["roster", "edit", "write", NONE, app],
	["leave", "view", "read", ["all", "own"], ["sched_calendar"]],
	["leave", "create", "write", ["all", "own"], ["sched_calendar"]],
	["leave", "approve", "write", NONE, app],
	["reminders", "view", "read", NONE, app],
	["reminders", "send", "write", NONE, app],
	["requests", "view", "read", NONE, app],
	["requests", "decide", "write", NONE, app],
	["records", "view", "read", ALL, ["sched_client", "sched_record"]],
	["records", "create", "write", ALL, ["sched_client"], { fieldGroup: "clinical" }],
	["records", "edit", "write", ALL, ["sched_record"], { fieldGroup: "clinical" }],
	["records", "delete", "write", ALL, ["sched_record"], { fieldGroup: "clinical" }],
	["records", "clinical_view", "read", ALL, ["sched_record"], { fieldGroup: "clinical" }],
	["files", "view", "read", ALL, ["sched_client", "sched_file"]],
	["files", "upload", "write", ALL, ["sched_client", "sched_file"]],
	["files", "delete", "write", ALL, ["sched_file"]],
	["audit", "view", "read", NONE, app],
	["builder", "view", "read", NONE, app],
	["builder", "edit", "write", NONE, app],
	["imports", "view", "read", NONE, app],
];

export const CATALOGUE: readonly PermissionDef[] = rows.map(
	([resource, action, effect, scopes, objects, extra]) => ({
		key: `${resource}_${action}`,
		resource,
		action,
		effect,
		scopes,
		objects,
		...extra,
	}),
);

const BY_KEY = new Map(CATALOGUE.map((def) => [def.key, def]));

export function permissionOf(key: string): PermissionDef | undefined {
	return BY_KEY.get(key);
}

/** The relation names a permission is held under on the app: its key, or the key per scope. */
export function appRelations(def: PermissionDef): string[] {
	return def.scopes.length === 0 ? [def.key] : def.scopes.map((scope) => `${def.key}_${scope}`);
}

export function allAppRelations(): string[] {
	return CATALOGUE.flatMap(appRelations);
}

/** Which permission key and scope an app relation name belongs to (`clients_edit_own` -> clients_edit, own). */
export function parseRelation(
	relation: string,
): { def: PermissionDef; scope: ScopeName | undefined } | undefined {
	const direct = BY_KEY.get(relation);
	if (direct !== undefined && direct.scopes.length === 0) return { def: direct, scope: undefined };
	for (const scope of ["all", "assigned", "own"] as const) {
		if (!relation.endsWith(`_${scope}`)) continue;
		const def = BY_KEY.get(relation.slice(0, -scope.length - 1));
		if (def !== undefined && def.scopes.includes(scope)) return { def, scope };
	}
	return undefined;
}
