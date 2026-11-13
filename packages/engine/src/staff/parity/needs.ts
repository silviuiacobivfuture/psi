import type { ToolKey } from "../copy";

/**
 * What the person must hold for a curated tool to be offered. A tool they cannot use is not shown
 * to the model at all; the service still refuses server-side (two layers). `any`: one of these;
 * `all`: every one; `open`: no permission (a pure calculation).
 */
export type Need = { any: ReadonlyArray<string> } | { all: ReadonlyArray<string> } | "open";

export const NEEDS: Readonly<Record<ToolKey, Need>> = {
	findClient: { any: ["clients_view"] },
	clientSummary: { any: ["clients_view"] },
	agenda: { any: ["calendar_view", "appointments_view"] },
	freeSlots: { any: ["calendar_view", "appointments_view"] },
	createAppointment: { all: ["appointments_create"] },
	moveAppointment: { all: ["appointments_edit"] },
	cancelAppointment: { all: ["appointments_cancel"] },
	markAttendance: { all: ["appointments_attend"] },
	recordPayment: { all: ["payments_create"] },
	packageBalance: { any: ["packages_view"] },
	roster: { any: ["roster_view"] },
	requestLeave: { all: ["leave_create"] },
	webRequests: { any: ["requests_view"] },
	markRequestHandled: { all: ["requests_decide"] },
	draftReminders: { any: ["reminders_view"] },
	sendReminders: { all: ["reminders_send"] },
	searchNotes: { any: ["records_view"] },
	stats: { any: ["appointments_view", "calendar_view"] },
	resolveDate: "open",
	roomsAt: { any: ["rooms_view", "devices_view", "calendar_view"] },
	freeRooms: { any: ["rooms_view", "devices_view", "calendar_view"] },
	attention: { any: ["packages_view"] },
	paymentReminders: { all: ["reminders_send", "packages_view"] },
	copyWeek: { all: ["appointments_create", "calendar_view"] },
	absence: { all: ["leave_create", "appointments_edit"] },
	activity: { any: ["audit_view"] },
	newBookings: { any: ["appointments_view", "calendar_view"] },
	siteIssues: { all: ["app_settings_edit"] },
	requestReply: { any: ["requests_view"] },
	createClient: { all: ["clients_create"] },
	/** The registry lists only what the person may do; the tools are always offered so it can be asked. */
	listActions: "open",
	runAction: "open",
	api: "open",
};

const SCOPE = /_(all|assigned|own)$/;

/** The base keys a set of capabilities holds: `clients_view_own` counts as `clients_view`. */
export function baseKeys(permissions: Iterable<string>): ReadonlySet<string> {
	const out = new Set<string>();
	for (const key of permissions) {
		out.add(key);
		out.add(key.replace(SCOPE, ""));
	}
	return out;
}

export function holds(caps: ReadonlySet<string>, key: string): boolean {
	return caps.has(key);
}

/** Whether a curated tool is offered to a person holding `caps` (undefined: the service could not say). */
export function offered(need: Need, caps: ReadonlySet<string> | undefined): boolean {
	if (need === "open" || caps === undefined) return true;
	return "any" in need ? need.any.some((k) => caps.has(k)) : need.all.every((k) => caps.has(k));
}
