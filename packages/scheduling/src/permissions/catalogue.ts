/**
 * The permission catalogue: the single source of what can be allowed (docs/plans/clinic.md
 * section 4). A permission is resource x action x scope, optionally x field group. Role contents
 * are data (lists of the keys below); the catalogue is code. The OpenFGA model and the roles
 * matrix in the console are generated from `CATALOGUE`, so they cannot drift from the code.
 *
 * A key is a legal OpenFGA relation name (letters, digits, underscore, hyphen, at most 50
 * characters): `appointments_edit_own`, `clients_view_all_clinical`. On a resource that has field
 * groups, a key WITHOUT a group grants identity only (name, status, ids): every field group is
 * granted only by its own explicit `_<group>` key, custom groups included.
 */

export const RESOURCES = [
	"app_settings",
	"members",
	"people",
	"roles",
	"builder",
	"services",
	"prices",
	"rooms",
	"devices",
	"group_activities",
	"calendars",
	"appointments",
	"clients",
	"report_aba",
	"report_racemeup",
	"report_psychotherapy",
	"report_custom",
	"questionnaire_parent",
	"files",
	"packages",
	"payments",
	"roster",
	"leave",
	"notice_board",
	"reminders",
	"web_requests",
	"reports",
	"audit_log",
	"imports_exports",
	"blacklist",
	"feedback",
	"notes",
	/** The organisation's billing and invoicing settings: the Owner's alone. */
	"billing",
	/** The organisation itself: deleting it, handing its ownership to someone else. The Owner's alone. */
	"organisation",
	/** The assistants' budget and limits (the organisation's tier of their configuration). The Owner's alone. */
	"assistant_budget",
] as const;
export type Resource = (typeof RESOURCES)[number];

export const ACTIONS = [
	"view",
	"create",
	"edit",
	"cancel",
	"delete",
	"archive",
	"export",
	"send",
	"approve",
	"assign",
	"price",
	"restore",
	"upload",
	"imports_view",
	"imports_run",
	/** Create a blacklist entry of warn severity only (a banner, never a refusal). */
	"create_warn",
	/** Book a blacklisted client anyway, with a reason: a warn or block_online hit. */
	"override",
	/** Book a client whose entry is block_all: the elevated override. */
	"override_admin",
	"reply",
	"close",
	/** Pin a note to the top of the client's summary. */
	"pin",
	/** Turn a client into a registered user of the online account (an e-mail invitation). */
	"invite",
	/** Add, remove or change the members who manage the team (an Administrator or an Owner), and give those roles. */
	"manage_admins",
	/** Hand the organisation's ownership to another member. */
	"transfer",
] as const;
export type Action = (typeof ACTIONS)[number];

export const SCOPES = ["all", "assigned", "own"] as const;
export type Scope = (typeof SCOPES)[number];

/** The built-in field groups; an app may add custom ones (`custom-<slug>`). */
export const FIELD_GROUPS = ["core", "contact", "guardian", "money", "clinical"] as const;
export type BaseFieldGroup = (typeof FIELD_GROUPS)[number];

const CUSTOM_GROUP = /^custom-[a-z0-9]{1,12}$/;
/** A field group: a built-in one or `custom-<slug>`. */
export type FieldGroup = BaseFieldGroup | `custom-${string}`;

export function isFieldGroup(text: string): text is FieldGroup {
	return (FIELD_GROUPS as ReadonlyArray<string>).includes(text) || CUSTOM_GROUP.test(text);
}

interface ResourceDef {
	readonly actions: ReadonlyArray<Action>;
	readonly scopes: ReadonlyArray<Scope>;
	readonly fieldGroups?: ReadonlyArray<BaseFieldGroup>;
}

const ALL: ReadonlyArray<Scope> = ["all"];
const EVERYWHERE: ReadonlyArray<Scope> = ["all", "assigned", "own"];
const CRUD: ReadonlyArray<Action> = ["view", "create", "edit", "delete"];

export const CATALOGUE: Readonly<Record<Resource, ResourceDef>> = {
	app_settings: { actions: ["view", "edit"], scopes: ALL },
	members: { actions: [...CRUD, "manage_admins"], scopes: ALL },
	people: { actions: ["view", "create", "edit", "archive"], scopes: ["all", "own"] },
	roles: { actions: CRUD, scopes: ALL },
	builder: { actions: CRUD, scopes: ALL },
	services: { actions: [...CRUD, "price"], scopes: ALL },
	prices: { actions: ["view", "edit"], scopes: ALL },
	rooms: { actions: CRUD, scopes: ALL },
	devices: { actions: CRUD, scopes: ALL },
	group_activities: { actions: CRUD, scopes: ALL },
	calendars: { actions: ["view", "edit", "assign"], scopes: EVERYWHERE },
	appointments: {
		actions: ["view", "create", "edit", "cancel", "delete", "restore", "assign", "send"],
		scopes: EVERYWHERE,
		fieldGroups: ["core", "money", "clinical"],
	},
	clients: {
		actions: [
			"view",
			"create",
			"edit",
			"archive",
			"delete",
			"restore",
			"export",
			"assign",
			"invite",
		],
		scopes: EVERYWHERE,
		fieldGroups: ["contact", "guardian", "money", "clinical"],
	},
	report_aba: { actions: [...CRUD, "export"], scopes: EVERYWHERE },
	report_racemeup: { actions: [...CRUD, "export"], scopes: EVERYWHERE },
	report_psychotherapy: { actions: [...CRUD, "export"], scopes: EVERYWHERE },
	report_custom: { actions: [...CRUD, "export"], scopes: EVERYWHERE },
	questionnaire_parent: { actions: CRUD, scopes: EVERYWHERE },
	files: { actions: ["view", "upload", "delete", "export"], scopes: EVERYWHERE },
	packages: { actions: [...CRUD, "price"], scopes: EVERYWHERE },
	payments: { actions: [...CRUD, "export"], scopes: EVERYWHERE },
	roster: { actions: ["view", "edit"], scopes: EVERYWHERE },
	leave: { actions: ["view", "create", "edit", "cancel", "approve"], scopes: EVERYWHERE },
	notice_board: { actions: CRUD, scopes: ALL },
	reminders: { actions: ["view", "send"], scopes: EVERYWHERE },
	web_requests: { actions: ["view", "approve"], scopes: ALL },
	// Counts and rates are `core`; anything in money (revenue, package prices) needs the `money` key.
	reports: { actions: ["view", "export"], scopes: ALL, fieldGroups: ["core", "money"] },
	audit_log: { actions: ["view", "export"], scopes: ALL },
	imports_exports: { actions: ["imports_view", "imports_run", "export"], scopes: ALL },
	// Who may not book online (docs/plans/clinic.md section 10).
	blacklist: { actions: [...CRUD, "create_warn", "override", "override_admin"], scopes: ALL },
	// The text is `core`; who wrote it (contact details, consent to be contacted) is `contact`.
	feedback: { actions: ["view", "reply", "close"], scopes: ALL, fieldGroups: ["core", "contact"] },
	// Notes about a client. Here `own` is the notes a person wrote themselves and `all` is anyone's (unlike the clients' own,
	// the clients one treats): a key held at `own` edits, deletes or pins one's own notes only. The `clinical` group is the
	// `clinic` category, kept as ciphertext, which the other categories (general, administrative, payment, behaviour) are not.
	notes: {
		actions: ["view", "create", "edit", "delete", "pin"],
		scopes: ["all", "own"],
		fieldGroups: ["clinical"],
	},
	billing: { actions: ["view", "edit"], scopes: ALL },
	organisation: { actions: ["delete", "transfer"], scopes: ALL },
	assistant_budget: { actions: ["edit"], scopes: ALL },
};

/**
 * The Owner's own powers, above an Administrator's: managing the people who manage the team, the billing, the
 * assistants' budget, deleting the organisation and handing it over. No other seed role holds them.
 */
export const OWNER_ONLY_KEYS: ReadonlyArray<string> = [
	"members_manage_admins_all",
	"billing_view_all",
	"billing_edit_all",
	"organisation_delete_all",
	"organisation_transfer_all",
	"assistant_budget_edit_all",
];

/** A permission as structure. */
export interface Permission {
	readonly resource: Resource;
	readonly action: Action;
	readonly scope: Scope;
	readonly fieldGroup?: FieldGroup;
}

export const RELATION_NAME_MAX = 50;

/** The key of a permission: `resource_action_scope[_group]`. */
export function permissionKey(p: Permission): string {
	const base = `${p.resource}_${p.action}_${p.scope}`;
	return p.fieldGroup === undefined ? base : `${base}_${p.fieldGroup}`;
}

/** Every key the catalogue defines (custom groups are added by an app's builder, not listed). */
export function allPermissionKeys(): ReadonlyArray<string> {
	const keys: string[] = [];
	for (const resource of RESOURCES) {
		const def = CATALOGUE[resource];
		for (const action of def.actions) {
			for (const scope of def.scopes) {
				keys.push(permissionKey({ resource, action, scope }));
				for (const fieldGroup of def.fieldGroups ?? []) {
					keys.push(permissionKey({ resource, action, scope, fieldGroup }));
				}
			}
		}
	}
	return keys;
}

const BASE_KEYS: ReadonlyMap<string, Permission> = new Map(
	RESOURCES.flatMap((resource) => {
		const def = CATALOGUE[resource];
		return def.actions.flatMap((action) =>
			def.scopes.flatMap((scope) => {
				const plain: Permission = { resource, action, scope };
				const grouped = (def.fieldGroups ?? []).map(
					(fieldGroup): Permission => ({ resource, action, scope, fieldGroup }),
				);
				return [plain, ...grouped].map((p): [string, Permission] => [permissionKey(p), p]);
			}),
		);
	}),
);

/**
 * The structure of a key, or undefined when it is not one: a catalogue key, or a catalogue key
 * of a resource with field groups followed by `_custom-<slug>`.
 */
export function parsePermissionKey(key: string): Permission | undefined {
	const known = BASE_KEYS.get(key);
	if (known !== undefined) return known;
	const at = key.lastIndexOf("_custom-");
	if (at < 0) return undefined;
	const plain = BASE_KEYS.get(key.slice(0, at));
	const group = key.slice(at + 1);
	if (plain === undefined || plain.fieldGroup !== undefined || !isFieldGroup(group)) {
		return undefined;
	}
	if (CATALOGUE[plain.resource].fieldGroups === undefined) return undefined;
	return { ...plain, fieldGroup: group };
}

/** True when `key` names a permission the catalogue (plus custom groups) allows. */
export function isPermissionKey(key: string): boolean {
	return parsePermissionKey(key) !== undefined;
}

/** True when the resource's records carry field groups. */
export function hasFieldGroups(resource: Resource): boolean {
	return CATALOGUE[resource].fieldGroups !== undefined;
}

/** Every key the catalogue defines, once: the single source of the API's OpenFGA model and the console's matrix. */
export const ALL_PERMISSION_KEYS: ReadonlyArray<string> = allPermissionKeys();

/**
 * The OpenFGA relation name of a permission key. It is the key itself, checked: a legal relation
 * name (letters, digits, underscore, hyphen; at most 50 characters) of a key the catalogue allows.
 */
export function relationName(key: string): string {
	if (!isPermissionKey(key) || key.length > RELATION_NAME_MAX || !/^[a-z0-9_-]+$/.test(key)) {
		throw new RangeError(`not a permission key: ${key}`);
	}
	return key;
}

const RECORD_RESOURCES: Readonly<Record<string, Resource>> = {
	"aba-session-report": "report_aba",
	"race-me-up-report": "report_racemeup",
	"psychotherapy-report": "report_psychotherapy",
	"parent-questionnaire": "questionnaire_parent",
};

/**
 * The permission resource that governs the responses of a form: the seeded template's own, and
 * `report_custom` for every form an app's owners built.
 */
export function recordResourceFor(formKey: string): Resource {
	return RECORD_RESOURCES[formKey] ?? "report_custom";
}
