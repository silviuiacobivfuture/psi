import {
	type Action,
	allPermissionKeys,
	type BaseFieldGroup,
	CATALOGUE,
	permissionKey,
	type Resource,
	type Scope,
} from "./catalogue";

/** A role as seeded for a new app: editable by the app's owners afterwards. */
export interface SeedRole {
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

/** The keys of grants: one per action x scope, and per group when groups are given. */
function keysOf(grants: ReadonlyArray<Grant>): ReadonlyArray<string> {
	const keys = new Set<string>();
	for (const g of grants) {
		const def = CATALOGUE[g.resource];
		for (const action of g.actions) {
			for (const scope of g.scopes) {
				if (!def.actions.includes(action) || !def.scopes.includes(scope)) {
					throw new RangeError(`not in the catalogue: ${g.resource} ${action} ${scope}`);
				}
				if (g.groups === undefined)
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
	"report_race_me_up",
	"report_psychotherapy",
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

/** The roles every app starts with (docs/plans/clinic.md section 4), editable afterwards. */
export const SEED_ROLES: ReadonlyArray<SeedRole> = [
	{
		name: OWNER,
		description: "Everything, including roles and the audit log.",
		permissions: [...allPermissionKeys()].sort(),
	},
	{
		name: ADMIN,
		description: "Everything but roles and the audit log.",
		permissions: allPermissionKeys()
			.filter((key) => !key.startsWith("roles_") && !key.startsWith("audit_log_"))
			.sort(),
	},
	{
		name: RECEPTION,
		description:
			"The calendar, clients (contact, guardian, money), packages, payments, reminders, web requests, the roster to read; no clinical data.",
		permissions: keysOf([
			...CATALOGUE_VIEW,
			all("prices", ["view"]),
			all("calendars", ["view", "edit", "assign"]),
			all(
				"appointments",
				["view", "create", "edit", "cancel", "assign", "send"],
				["core", "money"],
			),
			all("clients", ["view", "create", "edit", "archive", "delete", "assign"], NOT_CLINICAL),
			all("packages", ["view", "create", "edit", "price"]),
			all("payments", ["view", "create", "edit"]),
			all("reminders", ["view", "send"]),
			all("web_requests", ["view", "approve"]),
			all("roster", ["view"]),
			all("leave", ["view"]),
			all("notice_board", ["create", "edit"]),
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
			own("parent_questionnaires", ["view"]),
			own("files", ["view", "create"]),
			own("reminders", ["view", "send"]),
			own("roster", ["view"]),
			own("leave", ["view", "create", "cancel"]),
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
			assigned("parent_questionnaires", ["view"]),
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
			all("reports", ["view", "export"]),
		]),
	},
];
