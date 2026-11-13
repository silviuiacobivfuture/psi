import type { StaffAction } from "@psi/engine/staff";

/** What a role may do through the assistant until the service's `/me` answers it (the fake's roles). */
const RECEPTION: ReadonlyArray<string> = [
	"calendar_view_all",
	"appointments_view_all",
	"appointments_create",
	"appointments_edit_all",
	"appointments_cancel",
	"appointments_attend",
	"clients_view_all",
	"clients_contact_view",
	"packages_view",
	"payments_create",
	"roster_view",
	"reminders_view",
	"reminders_send",
	"requests_view",
	"requests_decide",
	"rooms_view",
	"devices_view",
];

const OWNER: ReadonlyArray<string> = [
	...RECEPTION,
	"records_view",
	"audit_view",
	"app_settings_view",
	"app_settings_edit",
	"roles_view",
	"leave_create",
	"leave_approve",
	"roster_edit",
	"clients_delete",
];

export function permissionsFor(roles: ReadonlyArray<string>): ReadonlyArray<string> {
	return roles.includes("owner") ? OWNER : roles.includes("reception") ? RECEPTION : [];
}

const ACTION_KEY: Readonly<Record<StaffAction, string>> = {
	"appointments.create": "appointments_create",
	"appointments.move": "appointments_edit_all",
	"appointments.cancel": "appointments_cancel",
	"attendance.mark": "appointments_attend",
	"payments.record": "payments_create",
	"leave.request": "leave_create",
	"requests.handle": "requests_decide",
	"reminders.send": "reminders_send",
};

export function mayDo(permissions: ReadonlyArray<string>, action: StaffAction): boolean {
	return permissions.includes(ACTION_KEY[action]);
}
