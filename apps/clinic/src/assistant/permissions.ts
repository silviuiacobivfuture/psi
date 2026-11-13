import type { StaffAction } from "@psi/engine/staff";

/** The permission each assistant action needs, in the console's own keys (what the service's capabilities name). */
const ACTION_KEY: Readonly<Record<StaffAction, string>> = {
	"appointments.create": "appointments_create",
	"appointments.move": "appointments_edit",
	"appointments.cancel": "appointments_cancel",
	"attendance.mark": "appointments_edit",
	"payments.record": "payments_create",
	"leave.request": "leave_create",
	"requests.handle": "web_requests_approve",
	"reminders.send": "reminders_send",
};

/** Whether the permission keys held (scoped or not) allow the action. */
export function mayDo(permissions: ReadonlyArray<string>, action: StaffAction): boolean {
	return permissions.includes(ACTION_KEY[action]);
}
