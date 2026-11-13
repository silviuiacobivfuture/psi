import type { ScopeName } from "@psi/scheduling-sdk/contract";
import { allAppRelations, CATALOGUE, type PermissionDef, permissionOf } from "./catalogue";

export interface SeedRole {
	slug: string;
	name: string;
	description: string;
	/** App relation names. */
	permissions: string[];
}

/** The app relations of a permission at these scopes (an unscoped permission has one relation, whatever the scopes). */
function held(def: PermissionDef, scopes: readonly ScopeName[]): string[] {
	return def.scopes.length === 0
		? [def.key]
		: def.scopes.filter((s) => scopes.includes(s)).map((s) => `${def.key}_${s}`);
}

/** Named permission keys at these scopes. An unknown key throws: a typo cannot silently drop a permission. */
function keys(scopes: readonly ScopeName[], ...names: string[]): string[] {
	return names.flatMap((name) => {
		const def = permissionOf(name);
		if (def === undefined) throw new Error(`seed role names an unknown permission: ${name}`);
		return held(def, scopes);
	});
}

/** Every permission of these resources at these scopes, except the named keys. */
function resources(
	scopes: readonly ScopeName[],
	names: readonly string[],
	except: readonly string[] = [],
): string[] {
	return CATALOGUE.filter((d) => names.includes(d.resource) && !except.includes(d.key)).flatMap(
		(d) => held(d, scopes),
	);
}

const ALL: readonly ScopeName[] = ["all"];
const OWN: readonly ScopeName[] = ["own"];
const ASSIGNED: readonly ScopeName[] = ["assigned"];
const LOOKUPS = [
	"roster_view",
	"services_view",
	"rooms_view",
	"devices_view",
	"people_view",
	"groups_view",
] as const;

/** The seed roles of every new app (docs/plans/clinic.md section 4): editable data from the moment they exist. */
export function seedRoles(): SeedRole[] {
	return [
		{
			slug: "owner",
			name: "Owner",
			description: "Everything, including roles and the audit log.",
			permissions: allAppRelations(),
		},
		{
			slug: "admin",
			name: "Admin",
			description: "Everything but roles and the audit log.",
			permissions: allAppRelations().filter(
				(r) => !r.startsWith("roles_") && !r.startsWith("audit_"),
			),
		},
		{
			slug: "reception",
			name: "Reception",
			description:
				"The calendar, clients' contact, guardian and money, packages, payments, reminders, web requests and the roster; no clinical data.",
			permissions: [
				...resources(
					ALL,
					[
						"calendar",
						"appointments",
						"packages",
						"payments",
						"reminders",
						"requests",
						"roster",
						"people",
						"rooms",
						"devices",
						"groups",
						"services",
						"prices",
						"leave",
					],
					["leave_approve", "payments_delete", "people_delete"],
				),
				...keys(
					ALL,
					"clients_create",
					"clients_view",
					"clients_edit",
					"clients_archive",
					"clients_restore",
					"clients_delete",
					"clients_contact_view",
					"clients_contact_edit",
					"clients_guardian_view",
					"clients_guardian_edit",
					"clients_money_view",
					"clients_money_edit",
					"files_view",
					"files_upload",
				),
			],
		},
		{
			slug: "therapist",
			name: "Therapist",
			description:
				"Their own calendar and clients, the clinical records of the clients they treat, their own leave.",
			permissions: [
				...resources(
					OWN,
					["calendar", "appointments", "records", "files"],
					["appointments_money_view", "appointments_money_edit", "appointments_assign"],
				),
				...keys(
					OWN,
					"clients_view",
					"clients_contact_view",
					"clients_guardian_view",
					"clients_clinical_view",
					"clients_clinical_edit",
					"leave_view",
					"leave_create",
				),
				...keys(ALL, ...LOOKUPS),
			],
		},
		{
			slug: "coordinator",
			name: "Coordinator",
			description: "The calendars and clients of the practitioners they are assigned to.",
			permissions: [
				...resources(
					ASSIGNED,
					["calendar", "appointments", "records", "files"],
					["appointments_money_view", "appointments_money_edit"],
				),
				...keys(
					ASSIGNED,
					"clients_view",
					"clients_contact_view",
					"clients_guardian_view",
					"clients_clinical_view",
				),
				...keys(ALL, ...LOOKUPS),
			],
		},
		{
			slug: "volunteer",
			name: "Volunteer",
			description: "Their own roster and leave.",
			permissions: [...keys(ALL, "roster_view"), ...keys(OWN, "leave_view", "leave_create")],
		},
		{
			slug: "accountant",
			name: "Accountant",
			description: "Money and reports, read-only.",
			permissions: [
				...keys(
					ALL,
					"clients_view",
					"clients_money_view",
					"packages_view",
					"payments_view",
					"appointments_view",
					"appointments_money_view",
				),
				...keys(ALL, "prices_view", "audit_view"),
			],
		},
	];
}
