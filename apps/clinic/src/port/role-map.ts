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
	calendars: { view: "calendar_view" },
	groups: {
		view: "groups_view",
		create: "groups_create",
		edit: "groups_edit",
		cancel: "groups_delete",
	},
	clients: {
		view: "clients_view",
		create: "clients_create",
		edit: "clients_edit",
		archive: "clients_archive",
		cancel: "clients_delete",
		export: "clients_export",
	},
	clinical: { view: "records_view", create: "records_create", edit: "records_edit" },
	files: { view: "files_view", create: "files_upload", cancel: "files_delete" },
	packages: {
		view: "packages_view",
		create: "packages_create",
		edit: "packages_edit",
		cancel: "packages_delete",
	},
	payments: { view: "payments_view", create: "payments_create" },
	prices: { view: "prices_view", edit: "prices_change" },
	roster: { view: "roster_view", edit: "roster_edit" },
	leave: { view: "leave_view", create: "leave_create", approve: "leave_approve" },
	reminders: { view: "reminders_view", send: "reminders_send" },
	requests: { view: "requests_view", approve: "requests_decide" },
	settings: { view: "app_settings_view", edit: "app_settings_edit" },
	members: { view: "members_view", edit: "members_edit", cancel: "members_remove" },
	roles: { view: "roles_view", create: "roles_create", edit: "roles_edit", cancel: "roles_delete" },
	audit: { view: "audit_view" },
} as const satisfies Record<string, Record<string, string>>;

type Entry = { resource: string; action: string; key: string };
const ENTRIES: ReadonlyArray<Entry> = Object.entries(KEYS).flatMap(([resource, actions]) =>
	Object.entries(actions).map(([action, key]) => ({ resource, action, key })),
);
const BY_KEY = new Map(ENTRIES.map((e) => [e.key, e]));
const WIDTH: Readonly<Record<ScopeName, number>> = { all: 3, assigned: 2, own: 1 };

const GROUP_KEY = (g: FieldGroupName): string => `clients_${g}_view`;
const GROUP_KEYS = new Set<string>(FIELD_GROUPS.map(GROUP_KEY));

/** `clients_view_all` -> (clients_view, all); an unscoped relation is its own key with no scope. */
export function splitRelation(relation: string): { key: string; scope: ScopeName | null } {
	for (const scope of SCOPES)
		if (relation.endsWith(`_${scope}`)) return { key: relation.slice(0, -scope.length - 1), scope };
	return { key: relation, scope: null };
}

/** The role editor's view of a role's permissions (relation names or bare keys): the widest scope per pair. */
export function grantsFromRelations(relations: ReadonlyArray<string>): {
	grants: Role["grants"];
	fieldGroups: Role["fieldGroups"];
} {
	const widest = new Map<string, ScopeName>();
	const groups = new Set<FieldGroupName>();
	for (const relation of relations) {
		const { key, scope } = splitRelation(relation);
		const group = FIELD_GROUPS.find((g) => GROUP_KEY(g) === key);
		if (group !== undefined) groups.add(group);
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
 * is kept as it was. `scopesOf(key)` is what the service's matrix says the key can be held at (`[]`: unscoped).
 */
export function relationsFromGrants(
	role: Pick<Role, "grants" | "fieldGroups">,
	existing: ReadonlyArray<string>,
	scopesOf: (key: string) => ReadonlyArray<ScopeName>,
): string[] {
	const kept = existing.filter((relation) => {
		const { key } = splitRelation(relation);
		return !BY_KEY.has(key) && !GROUP_KEYS.has(key);
	});
	// A field group still granted keeps its edit relation as it was; one removed loses view and edit together.
	const editKept = existing.filter((relation) => {
		const { key } = splitRelation(relation);
		const group = FIELD_GROUPS.find((g) => `clients_${g}_edit` === key);
		return group !== undefined && role.fieldGroups.includes(group);
	});
	const written: string[] = [];
	for (const [resource, actions] of Object.entries(role.grants)) {
		for (const [action, scope] of Object.entries(actions)) {
			const key = (KEYS as Record<string, Record<string, string>>)[resource]?.[action];
			if (key === undefined) continue;
			written.push(scopesOf(key).length === 0 ? key : `${key}_${scope}`);
		}
	}
	for (const g of role.fieldGroups) {
		const key = GROUP_KEY(g);
		written.push(scopesOf(key).length === 0 ? key : `${key}_all`);
	}
	return [...new Set([...kept, ...editKept, ...written])].sort();
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
