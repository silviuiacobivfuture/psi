import {
	type Action,
	allPermissionKeys,
	type BaseFieldGroup,
	CATALOGUE,
	OWNER_ONLY_KEYS,
	permissionKey,
	type Resource,
	type Scope,
} from "./catalogue";

/** A role as seeded for a new app: editable by the app's owners afterwards. */
export interface SeedRole {
	readonly name: string;
	readonly description: string;
	/** Its own keys: what it adds to the roles it includes. */
	readonly permissions: ReadonlyArray<string>;
	/** The names of the seed roles it includes (their keys are held through them). */
	readonly includes: ReadonlyArray<string>;
}

/** What a seed role holds in the end, before it is split into its own keys and the roles it includes. */
interface FlatRole {
	readonly name: string;
	readonly description: string;
	readonly permissions: ReadonlyArray<string>;
}

interface Grant {
	readonly resource: Resource;
	readonly actions: ReadonlyArray<Action>;
	readonly scopes: ReadonlyArray<Scope>;
	readonly groups?: ReadonlyArray<BaseFieldGroup>;
}

/** The keys of grants: one per action x scope (identity), and one per group given. */
function keysOf(grants: ReadonlyArray<Grant>): ReadonlyArray<string> {
	const keys = new Set<string>();
	for (const g of grants) {
		const def = CATALOGUE[g.resource];
		for (const action of g.actions) {
			for (const scope of g.scopes) {
				if (!def.actions.includes(action) || !def.scopes.includes(scope)) {
					throw new RangeError(`not in the catalogue: ${g.resource} ${action} ${scope}`);
				}
				// The key without a group (identity) always comes with the groups chosen.
				keys.add(permissionKey({ resource: g.resource, action, scope }));
				for (const fieldGroup of g.groups ?? []) {
					keys.add(permissionKey({ resource: g.resource, action, scope, fieldGroup }));
				}
			}
		}
	}
	return [...keys].sort();
}

const all = (
	resource: Resource,
	actions: ReadonlyArray<Action>,
	groups?: ReadonlyArray<BaseFieldGroup>,
): Grant => ({
	resource,
	actions,
	scopes: ["all"],
	...(groups === undefined ? {} : { groups }),
});
const own = (
	resource: Resource,
	actions: ReadonlyArray<Action>,
	groups?: ReadonlyArray<BaseFieldGroup>,
): Grant => ({
	resource,
	actions,
	scopes: ["own"],
	...(groups === undefined ? {} : { groups }),
});
const assigned = (
	resource: Resource,
	actions: ReadonlyArray<Action>,
	groups?: ReadonlyArray<BaseFieldGroup>,
): Grant => ({
	resource,
	actions,
	scopes: ["assigned"],
	...(groups === undefined ? {} : { groups }),
});

const REPORTS: ReadonlyArray<Resource> = [
	"report_aba",
	"report_racemeup",
	"report_psychotherapy",
	"report_custom",
];
const CATALOGUE_VIEW: ReadonlyArray<Grant> = [
	all("services", ["view"]),
	all("rooms", ["view"]),
	all("devices", ["view"]),
	all("group_activities", ["view"]),
	all("notice_board", ["view"]),
];
const NOT_CLINICAL: ReadonlyArray<BaseFieldGroup> = ["contact", "guardian", "money"];

export const OWNER = "Owner";
export const ADMIN = "Admin";
export const RECEPTION = "Reception";
export const THERAPIST = "Therapist";
export const COORDINATOR = "Coordinator";
export const VOLUNTEER = "Volunteer";
export const ACCOUNTANT = "Accountant";

/** What each seed role holds in the end (docs/plans/clinic.md section 4). */
const FLAT_ROLES: ReadonlyArray<FlatRole> = [
	{
		name: OWNER,
		description:
			"Everything an Administrator does, and the Owner's own: roles, the audit log, the people who manage the team, billing, the assistants' budget, deleting and handing over the organisation.",
		permissions: [...allPermissionKeys()].sort(),
	},
	{
		name: ADMIN,
		description:
			"Everything but roles, the audit log and the Owner's own powers; manages every member except Administrators and Owners.",
		permissions: allPermissionKeys()
			.filter(
				(key) =>
					!key.startsWith("roles_") &&
					!key.startsWith("audit_log_") &&
					!OWNER_ONLY_KEYS.includes(key),
			)
			.sort(),
	},
	{
		name: RECEPTION,
		description:
			"The calendar, clients (contact, guardian, money), packages, payments, reminders, web requests, the roster to read; no clinical data.",
		permissions: keysOf([
			...CATALOGUE_VIEW,
			all("prices", ["view"]),
			all("people", ["view"]),
			all("calendars", ["view", "edit", "assign"]),
			all(
				"appointments",
				["view", "create", "edit", "cancel", "assign", "send"],
				["core", "money"],
			),
			all(
				"clients",
				["view", "create", "edit", "archive", "delete", "assign", "invite"],
				NOT_CLINICAL,
			),
			all("packages", ["view", "create", "edit", "price"]),
			all("payments", ["view", "create", "edit"]),
			all("reminders", ["view", "send"]),
			all("web_requests", ["view", "approve"]),
			all("roster", ["view"]),
			all("availability", ["view"]),
			all("leave", ["view"]),
			all("notice_board", ["create", "edit"]),
			// View the list and flag someone at warn level; the stronger entries and every
			// override are the admin's.
			all("blacklist", ["view", "create_warn"]),
			all("feedback", ["view", "reply", "close"], ["core", "contact"]),
			// Every category but the clinical one; edits and deletes only what they wrote (the handler holds the author).
			all("notes", ["view", "create", "pin"]),
			own("notes", ["edit", "delete"]),
		]),
	},
	{
		name: THERAPIST,
		description:
			"Their own calendar and clients, the clinical record and reports of the clients they treat, their own leave; no money.",
		permissions: keysOf([
			...CATALOGUE_VIEW,
			own("calendars", ["view"]),
			own("appointments", ["view", "create", "edit", "cancel"], ["core", "clinical"]),
			own("clients", ["view"], ["contact", "guardian", "clinical"]),
			own("clients", ["edit"], ["clinical"]),
			...REPORTS.map((r) => own(r, ["view", "create", "edit"])),
			own("questionnaire_parent", ["view"]),
			own("files", ["view", "upload"]),
			// Their clients' notes, the clinical ones too; they change and pin only the notes they wrote.
			all("notes", ["view"], ["clinical"]),
			own("notes", ["create", "edit", "delete", "pin"], ["clinical"]),
			own("reminders", ["view", "send"]),
			own("roster", ["view"]),
			own("leave", ["view", "create", "cancel"]),
			// Their own weekly hours and days off, as the public site offers them.
			own("availability", ["view", "edit"]),
		]),
	},
	{
		name: COORDINATOR,
		description: "The calendars, clients and reports of the practitioners they are assigned to.",
		permissions: keysOf([
			...CATALOGUE_VIEW,
			assigned("calendars", ["view"]),
			assigned("appointments", ["view", "edit"], ["core", "clinical"]),
			assigned("clients", ["view"], ["contact", "guardian", "clinical"]),
			...REPORTS.map((r) => assigned(r, ["view"])),
			assigned("questionnaire_parent", ["view"]),
			all("notes", ["view"], ["clinical"]),
			assigned("reminders", ["view"]),
			assigned("roster", ["view"]),
			assigned("leave", ["view", "approve"]),
		]),
	},
	{
		name: VOLUNTEER,
		description: "Their own roster and leave.",
		permissions: keysOf([
			all("notice_board", ["view"]),
			own("roster", ["view"]),
			own("leave", ["view", "create", "cancel"]),
		]),
	},
	{
		name: ACCOUNTANT,
		description: "Money and reports, read-only.",
		permissions: keysOf([
			all("services", ["view"]),
			all("prices", ["view"]),
			all("appointments", ["view"], ["core", "money"]),
			all("clients", ["view"], ["contact", "money"]),
			all("packages", ["view"]),
			all("payments", ["view", "export"]),
			all("reports", ["view", "export"], ["core", "money"]),
		]),
	},
];

/**
 * Which seed roles include which: chosen so that each role holds exactly what its flat definition gives it (every
 * included role's keys are a subset of the includer's; the test asserts it). Owner includes Administrator; Administrator
 * the four desk and clinical roles; Terapeut includes Voluntar. Coordonator does NOT include Terapeut: a coordinator reaches
 * the calendars they are assigned, a therapist their own, and neither set contains the other.
 */
const INCLUDES: Readonly<Record<string, ReadonlyArray<string>>> = {
	[OWNER]: [ADMIN],
	[ADMIN]: [RECEPTION, THERAPIST, COORDINATOR, ACCOUNTANT],
	[THERAPIST]: [VOLUNTEER],
};

const flatOf = (name: string): ReadonlyArray<string> =>
	FLAT_ROLES.find((r) => r.name === name)?.permissions ?? [];

/** The roles every app starts with, editable afterwards: each one's own keys and the roles it includes. */
export const SEED_ROLES: ReadonlyArray<SeedRole> = FLAT_ROLES.map((role) => {
	const includes = INCLUDES[role.name] ?? [];
	const inherited = new Set(includes.flatMap((name) => flatOf(name)));
	return {
		name: role.name,
		description: role.description,
		permissions: role.permissions.filter((k) => !inherited.has(k)),
		includes,
	};
});

/** What a seed role holds in the end (its own keys and every included role's): the flat definition. */
export function seedEffective(name: string): ReadonlyArray<string> {
	return flatOf(name);
}
