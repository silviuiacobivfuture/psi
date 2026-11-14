import { recordKeys } from "../actions/keys";
import { ACTIONS } from "../actions/registry";
import { ORG_AREAS, PLATFORM_KEY } from "./areas";
import type { Can } from "./can";

/**
 * Which permission each screen and each write needs, in ONE table. A request that does not hold it is refused before
 * its page runs. This is the console's first line only: the scheduling service authorizes every call again with the
 * person's own token, and its refusal is what finally counts.
 */
interface Gate {
	method: "GET" | "POST";
	path: RegExp;
	/** Any one of these; none listed: every signed-in person. */
	keys: ReadonlyArray<string>;
	/** A change: refused outright while looking at the app as someone else. */
	write?: true;
}

const g = (method: Gate["method"], path: string, keys: string[], write?: true): Gate => ({
	method,
	path: new RegExp(`^${path}/?$`),
	keys,
	...(write === undefined ? {} : { write }),
});

/** The routes of the action registry, each gated by what its action needs: a write or a read of any listed key. */
const ACTION_GATES: ReadonlyArray<Gate> = ACTIONS.flatMap((a) =>
	a.route === null
		? []
		: [
				{
					method: a.route.method,
					path: new RegExp(`^${a.route.path.replace(/:[a-z]+/g, "[^/]+")}/?$`),
					keys: [...(a.needs.write ?? a.needs.read ?? [])],
					...(a.route.method === "POST" && a.needs.write !== undefined
						? { write: true as const }
						: {}),
				},
			],
);

const AREA_GATES: ReadonlyArray<Gate> = ORG_AREAS.map((a) => g("GET", a.href, [...a.keys]));

const GATES: ReadonlyArray<Gate> = [
	g("GET", "/calendar", ["calendars_view"]),
	g("GET", "/calendar/print", ["calendars_view"]),
	g("GET", "/calendar/appointment/[^/]+", ["calendars_view", "appointments_view"]),
	g("GET", "/calendar/editor", ["appointments_create", "appointments_edit"], true),
	g("POST", "/calendar/editor/check", ["appointments_create", "appointments_edit"]),
	g("POST", "/calendar/editor/clients", ["clients_create"], true),
	g("POST", "/calendar/editor/save", ["appointments_create", "appointments_edit"], true),
	g("POST", "/appointments/[^/]+/(attended|no-show)", ["appointments_edit"], true),
	g("POST", "/appointments/[^/]+/cancel", ["appointments_cancel"], true),
	g("POST", "/appointments/[^/]+/pay", ["payments_create"], true),
	g("POST", "/inbox/read(-all)?", [], true),
	g("GET", "/floor", ["calendars_view"]),
	g("GET", "/floor/api/live/(stream)", ["calendars_view"]),
	g("POST", "/floor/api/live/render", ["calendars_view"]),
	g("POST", "/floor/api/draw/render", ["app_settings_edit"]),
	g("POST", "/floor/api/draw/save", ["app_settings_edit"], true),
	g("GET", "/search(/live)?", ["clients_view"]),
	g("GET", "/clients", ["clients_view"]),
	g("GET", "/clients/[^/]+", ["clients_view"]),
	g("GET", "/clients/[^/]+/appointments", ["appointments_view"]),
	g("GET", "/clients/[^/]+/packages", ["packages_view"]),
	g("GET", "/clients/[^/]+/records", ["clients_view_clinical"]),
	g("GET", "/clients/[^/]+/files", ["files_view"]),
	g("GET", "/clients/[^/]+/more/appointments", ["appointments_view"]),
	g("GET", "/clients/[^/]+/more/notes", ["clients_view"]),
	g("GET", "/clients/[^/]+/more/records", ["clients_view_clinical"]),
	g("GET", "/clients/[^/]+/more/files", ["files_view"]),
	g("POST", "/clients/[^/]+/archive", ["clients_archive"], true),
	g("POST", "/clients/[^/]+/delete", ["clients_delete"], true),
	g("GET", "/clients/[^/]+/invite", ["clients_invite"]),
	g("POST", "/clients/[^/]+/invite/(preview|send|resend|revoke)", ["clients_invite"], true),
	g("POST", "/clients/[^/]+/packages", ["packages_create"], true),
	g("POST", "/clients/[^/]+/packages/[^/]+/field/[^/]+", ["packages_edit"], true),
	g("POST", "/clients/[^/]+/packages/[^/]+/payments", ["payments_create"], true),
	g("GET", "/requests(/more)?", ["web_requests_view"]),
	g("GET", "/settings/blacklist/more", ["blacklist_view"]),
	g("GET", "/settings/members/more", ["members_view"]),
	g("POST", "/requests/[^/]+/handled", ["web_requests_approve"], true),
	g("GET", "/roster", ["roster_view"]),
	g("GET", "/reminders(/more)?", ["reminders_view"]),
	g("POST", "/reminders/[^/]+/sent", ["reminders_send"], true),
	g("POST", "/settings/roles/[^/]+", ["roles_edit"], true),
	g("GET", "/stats", ["reports_view_core"]),
	// Records of no client: an app-wide record scope is what the page itself demands; any record view key gets this far.
	g("GET", "/records(/[^/]+)?", recordKeys("view")),
	g(
		"GET",
		"/settings",
		ORG_AREAS.flatMap((a) => [...a.keys]),
	),
	...AREA_GATES,
	...ACTION_GATES,
	g("GET", "/audit", ["audit_log_view"]),
	g("GET", "/settings/audit/[^/]+", ["audit_log_view"]),
	g("GET", "/settings/assistant/people", ["app_settings_view"]),
	g("GET", "/platform", [PLATFORM_KEY]),
	g("GET", "/platform/assistant", [PLATFORM_KEY]),
	g("GET", "/live", ["calendars_view", "web_requests_view"]),
];

export type Verdict = "allowed" | "forbidden" | "read-only";

export function judge(method: string, path: string, can: Can): Verdict {
	const gate = GATES.find((x) => x.method === method && x.path.test(path));
	if (gate === undefined) return "allowed";
	if (gate.keys.length > 0 && !gate.keys.some((k) => can.has(k))) return "forbidden";
	if (gate.write === true && can.readOnly) return "read-only";
	return "allowed";
}

/** Packages and records tabs of a client, with the permission each needs. */
export const CLIENT_TAB_KEYS = {
	overview: "clients_view",
	notes: "clients_view",
	appointments: "appointments_view",
	packages: "packages_view",
	records: "clients_view_clinical",
	files: "files_view",
} as const;

/** Where someone lands when what they are viewing as has no calendar: the first screen that role may open. */
export function landingFor(can: Can): string {
	const order: ReadonlyArray<readonly [string, string]> = [
		["calendars_view", "/calendar"],
		["clients_view", "/clients"],
		["web_requests_view", "/requests"],
		["roster_view", "/roster"],
		["reminders_view", "/reminders"],
		["audit_log_view", "/settings/audit"],
	];
	return order.find(([key]) => can.has(key))?.[1] ?? "/more";
}
