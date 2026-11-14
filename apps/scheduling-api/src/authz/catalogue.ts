import {
	type Action,
	ALL_PERMISSION_KEYS,
	type BaseFieldGroup,
	type Permission,
	parsePermissionKey,
	permissionKey,
	CATALOGUE as RESOURCE_CATALOGUE,
	RESOURCES,
	type Resource,
	relationName,
	type Scope,
} from "@psi/scheduling/permissions";
import type { SchedType } from "@psi/scheduling-sdk/contract";

/**
 * THE PERMISSION CATALOGUE of this service is `@psi/scheduling/permissions`: resource x action x scope, optionally
 * x field group, as keys `<resource>_<action>_<scope>[_<group>]`. Nothing is copied here. This module derives what the
 * service needs from it: the keys WITHOUT a scope that a route and a handler name (`clients_view`,
 * `clients_view_clinical`), where each is checked (the OpenFGA object types), and the relation names it is held under.
 *
 * A key without a group grants identity only; every field group is granted only by its own `_<group>` key. Custom
 * groups (`custom-<slug>`) are not in `ALL_PERMISSION_KEYS`, so they are not relations of the pinned model.
 */
export type { Action, BaseFieldGroup, Resource, Scope };
export { ALL_PERMISSION_KEYS, RESOURCES, relationName };

/** One permission as the service checks it: the key without its scope, and the scopes the catalogue defines for it. */
export interface PermissionDef {
	/** `clients_view`, `clients_view_clinical`: `<resource>_<action>[_<group>]`. */
	key: string;
	resource: Resource;
	action: Action;
	group?: BaseFieldGroup;
	effect: "read" | "write";
	scopes: readonly Scope[];
	/** The object types a Check of this permission is made on; `["sched_app"]` when it is held on the whole app only. */
	objects: readonly SchedType[];
	/** The estate's platform administrators hold it in every app (app settings, members, roles). */
	platformAdmin?: true;
}

const APP: readonly SchedType[] = ["sched_app"];
const CALENDAR: readonly SchedType[] = ["sched_calendar"];
const APPOINTMENT: readonly SchedType[] = ["sched_appointment"];
const CLIENT: readonly SchedType[] = ["sched_client"];

type Where = readonly SchedType[] | Partial<Record<Action, readonly SchedType[]>>;

/** Per resource, the object types its permissions are checked on (the rest of an action's list is the default). */
const WHERE: Readonly<Record<Resource, Where>> = {
	app_settings: APP,
	members: APP,
	roles: APP,
	builder: APP,
	services: APP,
	prices: APP,
	rooms: APP,
	devices: APP,
	group_activities: APP,
	notice_board: APP,
	blacklist: APP,
	feedback: APP,
	// Asked of the app: `own` here is the notes a person wrote, not the clients they treat (the handler holds the author).
	notes: APP,
	web_requests: APP,
	reports: APP,
	audit_log: APP,
	imports_exports: APP,
	billing: APP,
	organisation: APP,
	assistant_budget: APP,
	people: { create: APP, view: CALENDAR, edit: CALENDAR, archive: CALENDAR },
	calendars: CALENDAR,
	roster: CALENDAR,
	leave: CALENDAR,
	appointments: { create: CALENDAR, view: APPOINTMENT },
	reminders: APPOINTMENT,
	clients: { create: APP, view: CLIENT },
	report_aba: reportWhere(),
	report_racemeup: reportWhere(),
	report_psychotherapy: reportWhere(),
	report_custom: reportWhere(),
	questionnaire_parent: reportWhere(),
	files: {
		view: ["sched_client", "sched_file"],
		upload: ["sched_client", "sched_file"],
		delete: ["sched_file"],
		export: ["sched_file"],
	},
	packages: {
		view: ["sched_client", "sched_package"],
		create: CLIENT,
		edit: ["sched_package"],
		delete: ["sched_package"],
		price: ["sched_package"],
	},
	payments: ["sched_client", "sched_package"],
};

function reportWhere(): Where {
	return {
		create: CLIENT,
		view: ["sched_client", "sched_record"],
		edit: ["sched_record"],
		delete: ["sched_record"],
		export: ["sched_record"],
	};
}

/** The object types that an action of a resource without its own entry defaults to (clients: the client). */
function objectsOf(resource: Resource, action: Action): readonly SchedType[] {
	const where = WHERE[resource];
	if (Array.isArray(where)) return where;
	const given = (where as Partial<Record<Action, readonly SchedType[]>>)[action];
	if (given !== undefined) return given;
	if (resource === "appointments") return APPOINTMENT;
	if (resource === "clients") return CLIENT;
	throw new Error(`no placement for ${resource} ${action}`);
}

/**
 * What the estate's platform administrators hold in every app: its settings, its team (Administrators and Owners
 * included), its roles, and the organisation itself (so one whose last Owner left can be handed over). Never billing
 * or the assistants' budget: those are the organisation's own.
 */
const PLATFORM_ADMIN: readonly Resource[] = ["app_settings", "members", "roles", "organisation"];
const READS: readonly Action[] = ["view", "export", "imports_view"];

function base(resource: Resource, action: Action, group?: BaseFieldGroup): string {
	return `${resource}_${action}${group === undefined ? "" : `_${group}`}`;
}

/** Every permission of the catalogue, once, without its scope: one entry per resource x action x (identity | group). */
export const CATALOGUE: readonly PermissionDef[] = RESOURCES.flatMap((resource) => {
	const def = RESOURCE_CATALOGUE[resource];
	return def.actions.flatMap((action): PermissionDef[] =>
		[undefined, ...(def.fieldGroups ?? [])].map((group) => ({
			key: base(resource, action, group),
			resource,
			action,
			...(group === undefined ? {} : { group }),
			effect: READS.includes(action) ? ("read" as const) : ("write" as const),
			scopes: def.scopes,
			objects:
				def.scopes.length === 1 && def.scopes[0] === "all" ? APP : objectsOf(resource, action),
			...(PLATFORM_ADMIN.includes(resource) ? { platformAdmin: true as const } : {}),
		})),
	);
});

const BY_KEY = new Map(CATALOGUE.map((def) => [def.key, def]));

export function permissionOf(key: string): PermissionDef | undefined {
	return BY_KEY.get(key);
}

/** The relation a permission is held under on the app at one scope: `clients_view_own_clinical`. */
export function appRelation(def: PermissionDef, scope: Scope): string {
	const p: Permission = {
		resource: def.resource,
		action: def.action,
		scope,
		...(def.group === undefined ? {} : { fieldGroup: def.group }),
	};
	return relationName(permissionKey(p));
}

/** Every relation of the permission on the app, one per scope the catalogue defines. */
export function appRelations(def: PermissionDef): string[] {
	return def.scopes.map((scope) => appRelation(def, scope));
}

export function allAppRelations(): string[] {
	return CATALOGUE.flatMap(appRelations);
}

/** True when the permission is defined on this object type (Checked on it), or on the app alone. */
export function checkedOn(def: PermissionDef, type: SchedType): boolean {
	return def.objects.includes(type);
}

/** Which permission and scope an app relation name belongs to (`clients_view_own_clinical` -> clients_view_clinical, own). */
export function parseRelation(relation: string): { def: PermissionDef; scope: Scope } | undefined {
	const parsed = parsePermissionKey(relation);
	if (parsed === undefined || parsed.fieldGroup?.startsWith("custom-") === true) return undefined;
	const def = BY_KEY.get(
		base(parsed.resource, parsed.action, parsed.fieldGroup as BaseFieldGroup | undefined),
	);
	return def === undefined ? undefined : { def, scope: parsed.scope };
}

/** Sanity for the generator's input: every catalogue key maps to a relation and back. */
export function catalogueIsClosed(): boolean {
	return (
		allAppRelations().length === ALL_PERMISSION_KEYS.length &&
		allAppRelations().every((relation) => ALL_PERMISSION_KEYS.includes(relation))
	);
}
