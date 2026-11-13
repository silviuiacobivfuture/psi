import { FIELD_GROUPS, type FieldGroupName, type Role, SCOPES, type ScopeName } from "./schema";

type Resource = keyof typeof KEYS;

/**
 * The console's role editor speaks resource × action; the service's catalogue speaks permission keys. This is the ONE
 * table between them. A pair with no key is something the service has no permission for; the editor shows nothing
 * the service would ignore, and a save never touches a permission this table does not name.
 */
const KEYS = {
	appointments: {
		view: "appointments_view",
		create: "appointments_create",
		edit: "appointments_edit",
		cancel: "appointments_cancel",
		assign: "appointments_assign",
	},
	calendars: { view: "calendars_view" },
	groups: {
		view: "group_activities_view",
		create: "group_activities_create",
		edit: "group_activities_edit",
		cancel: "group_activities_delete",
	},
	clients: {
		view: "clients_view",
		create: "clients_create",
		edit: "clients_edit",
		archive: "clients_archive",
		cancel: "clients_delete",
		export: "clients_export",
	},
	files: { view: "files_view", create: "files_upload", cancel: "files_delete" },
	packages: {
		view: "packages_view",
		create: "packages_create",
		edit: "packages_edit",
		cancel: "packages_delete",
	},
	payments: { view: "payments_view", create: "payments_create" },
	prices: { view: "prices_view", edit: "prices_edit" },
	roster: { view: "roster_view", edit: "roster_edit" },
	leave: { view: "leave_view", create: "leave_create", approve: "leave_approve" },
	reminders: { view: "reminders_view", send: "reminders_send" },
	requests: { view: "web_requests_view", approve: "web_requests_approve" },
	settings: { view: "app_settings_view", edit: "app_settings_edit" },
	members: { view: "members_view", edit: "members_edit", cancel: "members_delete" },
	roles: { view: "roles_view", create: "roles_create", edit: "roles_edit", cancel: "roles_delete" },
	audit: { view: "audit_log_view" },
} as const satisfies Record<string, Record<string, string>>;

type Entry = { resource: string; action: string; key: string };
const ENTRIES: ReadonlyArray<Entry> = Object.entries(KEYS).flatMap(([resource, actions]) =>
	Object.entries(actions).map(([action, key]) => ({ resource, action, key })),
);
const BY_KEY = new Map(ENTRIES.map((e) => [e.key, e]));
const WIDTH: Readonly<Record<ScopeName, number>> = { all: 3, assigned: 2, own: 1 };

/** A field group's view key as `/me` names it (`clients_view_clinical`); the stored relation adds the scope before the group. */
const GROUP_KEY = (g: FieldGroupName): string => `clients_view_${g}`;
const RELATION = /^(.+?)_(all|assigned|own)(?:_(contact|guardian|money|clinical|core))?$/;

interface Parsed {
	key: string;
	scope: ScopeName;
	group: FieldGroupName | null;
}

/** `clients_view_all_contact` -> (clients_view, all, contact); every stored permission names its scope. */
export function splitRelation(
	relation: string,
): Parsed | { key: string; scope: null; group: null } {
	const match = RELATION.exec(relation);
	if (match === null) return { key: relation, scope: null, group: null };
	const [, key = relation, scope, group] = match;
	const groupName = FIELD_GROUPS.find((g) => g === group);
	return {
		key,
		scope: SCOPES.find((x) => x === scope) ?? "all",
		group: groupName ?? null,
	};
}

/** The role editor's view of a role's permissions (stored relations): the widest scope per pair. */
export function grantsFromRelations(relations: ReadonlyArray<string>): {
	grants: Role["grants"];
	fieldGroups: Role["fieldGroups"];
} {
	const widest = new Map<string, ScopeName>();
	const groups = new Set<FieldGroupName>();
	for (const relation of relations) {
		const { key, scope, group } = splitRelation(relation);
		if (group !== null) {
			if (key === "clients_view") groups.add(group);
			continue;
		}
		const held = scope ?? "all";
		const had = widest.get(key);
		if (had === undefined || WIDTH[held] > WIDTH[had]) widest.set(key, held);
	}
	const grants: Record<string, Record<string, ScopeName>> = {};
	for (const [key, scope] of widest) {
		const entry = BY_KEY.get(key);
		if (entry === undefined) continue;
		grants[entry.resource] = { ...(grants[entry.resource] ?? {}), [entry.action]: scope };
	}
	return { grants, fieldGroups: FIELD_GROUPS.filter((g) => groups.has(g)) };
}

/**
 * The permission set to store after the editor saved a role: what the editor shows is replaced, what it cannot show
 * is kept as it was. Every stored permission names its scope (`prices_view_all`); a field group is the identity
 * key's own (`clients_view_all_contact`).
 */
export function relationsFromGrants(
	role: Pick<Role, "grants" | "fieldGroups">,
	existing: ReadonlyArray<string>,
): string[] {
	const kept = existing.filter((relation) => {
		const { key, group } = splitRelation(relation);
		if (BY_KEY.has(key)) return false;
		// A group of the clients' view is the editor's; any other action's group is kept while that group is granted.
		if (group !== null && key === "clients_view") return false;
		if (group !== null && key.startsWith("clients_") && !role.fieldGroups.includes(group))
			return false;
		return true;
	});
	const written: string[] = [];
	for (const [resource, actions] of Object.entries(role.grants)) {
		for (const [action, scope] of Object.entries(actions)) {
			const key = (KEYS as Record<string, Record<string, string>>)[resource]?.[action];
			if (key === undefined) continue;
			written.push(`${key}_${scope}`);
		}
	}
	for (const g of role.fieldGroups) written.push(`clients_view_all_${g}`);
	return [...new Set([...kept, ...written])].sort();
}

/** The permission keys a role holds, for the capabilities a fake answers with (`{key: [scope]}`). */
export function capabilityMap(
	role: Pick<Role, "grants" | "fieldGroups">,
): Record<string, ScopeName[]> {
	const out: Record<string, ScopeName[]> = {};
	for (const [resource, actions] of Object.entries(role.grants))
		for (const [action, scope] of Object.entries(actions)) {
			const key = (KEYS as Record<string, Record<string, string>>)[resource]?.[action];
			if (key !== undefined) out[key] = [scope];
		}
	for (const g of role.fieldGroups) out[GROUP_KEY(g)] = ["all"];
	return out;
}

export const MAPPED_RESOURCES: ReadonlyArray<Resource> = Object.keys(KEYS) as Resource[];
