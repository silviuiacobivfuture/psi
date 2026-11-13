import type { Can } from "./can";

/**
 * Which permission each screen and each write needs, in ONE table. A request that does not hold it is refused before
 * its page runs. This is the console's first line only: the scheduling service authorizes every call again with the
 * person's own token, and its refusal is what finally counts.
 */
interface Gate {
	method: "GET" | "POST";
	path: RegExp;
	/** Any one of these. */
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

const GATES: ReadonlyArray<Gate> = [
	g("GET", "/calendar", ["calendar_view"]),
	g("POST", "/calendar/new", ["appointments_create"], true),
	g("GET", "/search(/live)?", ["clients_view"]),
	g("GET", "/clients", ["clients_view"]),
	g("GET", "/clients/[^/]+", ["clients_view"]),
	g("GET", "/clients/[^/]+/appointments", ["appointments_view"]),
	g("GET", "/clients/[^/]+/packages", ["packages_view"]),
	g("GET", "/clients/[^/]+/records", ["records_view"]),
	g("GET", "/clients/[^/]+/files", ["files_view"]),
	g("POST", "/clients/[^/]+/archive", ["clients_archive"], true),
	g("POST", "/clients/[^/]+/delete", ["clients_delete"], true),
	g("POST", "/clients/[^/]+/packages/[^/]+/calc", ["packages_view"]),
	g("POST", "/clients/[^/]+/packages/[^/]+/save", ["packages_edit"], true),
	g("GET", "/requests", ["requests_view"]),
	g("POST", "/requests/[^/]+/handled", ["requests_decide"], true),
	g("GET", "/roster", ["roster_view"]),
	g("GET", "/reminders", ["reminders_view"]),
	g("POST", "/reminders/[^/]+/sent", ["reminders_send"], true),
	g("GET", "/settings/people", ["people_view"]),
	g("GET", "/settings/rooms", ["rooms_view"]),
	g("GET", "/settings/devices", ["devices_view"]),
	g("GET", "/settings/services", ["services_view"]),
	g("GET", "/settings/roles", ["roles_view"]),
	g("POST", "/settings/roles/[^/]+", ["roles_edit"], true),
	g("GET", "/audit", ["audit_view"]),
	g("GET", "/live", ["calendar_view", "requests_view"]),
];

export type Verdict = "allowed" | "forbidden" | "read-only";

export function judge(method: string, path: string, can: Can): Verdict {
	const gate = GATES.find((x) => x.method === method && x.path.test(path));
	if (gate === undefined) return "allowed";
	if (!gate.keys.some((k) => can.has(k))) return "forbidden";
	if (gate.write === true && can.readOnly) return "read-only";
	return "allowed";
}

/** The settings tabs this person may open, in the order of the screen; the notifications tab is everyone's own. */
export const SETTINGS_TAB_KEYS = {
	people: "people_view",
	rooms: "rooms_view",
	devices: "devices_view",
	services: "services_view",
	roles: "roles_view",
} as const;

/** Packages and records tabs of a client, with the permission each needs. */
export const CLIENT_TAB_KEYS = {
	overview: "clients_view",
	appointments: "appointments_view",
	packages: "packages_view",
	records: "records_view",
	files: "files_view",
} as const;

/** Where someone lands when what they are viewing as has no calendar: the first screen that role may open. */
export function landingFor(can: Can): string {
	const order: ReadonlyArray<readonly [string, string]> = [
		["calendar_view", "/calendar"],
		["clients_view", "/clients"],
		["requests_view", "/requests"],
		["roster_view", "/roster"],
		["reminders_view", "/reminders"],
		["audit_view", "/audit"],
	];
	return order.find(([key]) => can.has(key))?.[1] ?? "/more";
}
