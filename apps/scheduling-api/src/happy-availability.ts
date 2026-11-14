import type { Populated } from "./testing/populate";
import { HOUR, NOW, type Reply } from "./testing/world";

/**
 * The happy paths of the availability editor's routes and of the booking pauses (merged into `EXTRA_HAPPY`). A pause made
 * here starts far in the future, so nothing the other cases book is paused.
 */
type Case = (w: Populated) => Promise<Reply>;
const A = "/v1/apps/psizone";
const olga = (w: Populated, method: string, path: string, body?: unknown): Promise<Reply> =>
	w.call("olga", method, `${A}${path}`, body);

const LATER = NOW + 300 * 24 * HOUR;
const pause = (w: Populated): Promise<Reply> =>
	olga(w, "POST", "/booking-pauses", {
		scope: { level: "organisation" },
		from: LATER,
		until: LATER + 24 * HOUR,
		callbacksOpen: true,
		blockStaff: false,
	});
let days = 0;
/** A date of its own, months ahead, for a case that adds a one-off day. */
const spareDate = (): string => {
	days += 1;
	return new Date(NOW + (120 + days) * 24 * HOUR).toISOString().slice(0, 10);
};
const closedDay = async (w: Populated): Promise<string> => {
	const date = spareDate();
	await olga(w, "POST", "/availability/one-offs", {
		personIds: [w.ids.dora],
		entry: { from: date, kind: "closed" },
	});
	const got = await olga(w, "GET", `/people/${w.ids.dora}/availability?from=${date}`);
	const rows = got.json.exceptions as { id: string; date: string }[];
	return rows.find((r) => r.date === date)?.id ?? "";
};
const closedRoom = async (w: Populated): Promise<string> => {
	const date = spareDate();
	const made = await olga(w, "POST", `/rooms/${w.ids.room}/closures`, { from: date });
	const rows = made.json.items as { id: string; date: string }[];
	return rows.find((r) => r.date === date)?.id ?? "";
};

export const AVAILABILITY_HAPPY = {
	"availability.get": (w) => olga(w, "GET", `/people/${w.ids.dora}/availability?from=2026-11-01`),
	"availability.rulesPut": async (w) => {
		const held = await olga(w, "GET", `/people/${w.ids.dora}/availability?from=2026-11-01`);
		return olga(w, "PUT", `/people/${w.ids.dora}/availability/rules`, { rules: held.json.rules });
	},
	"availability.copyRules": (w) =>
		olga(w, "POST", "/availability/copy", { from: w.ids.dora, to: [w.ids.elena] }),
	"availability.oneOffCreate": (w) =>
		olga(w, "POST", "/availability/one-offs", {
			personIds: [w.ids.dora, w.ids.elena],
			entry: { from: spareDate(), kind: "open", start: 600, end: 720 },
		}),
	"availability.oneOffRemove": async (w) =>
		olga(w, "DELETE", `/people/${w.ids.dora}/availability/one-offs/${await closedDay(w)}`),
	"availability.preview": (w) =>
		olga(
			w,
			"GET",
			`/people/${w.ids.dora}/availability/preview?service=evaluation&from=${NOW}&to=${NOW + 7 * 24 * HOUR}`,
		),
	"rooms.closures": (w) => olga(w, "GET", `/rooms/${w.ids.room}/closures?from=2026-11-01`),
	"rooms.closureCreate": (w) =>
		olga(w, "POST", `/rooms/${w.ids.room}/closures`, { from: spareDate(), start: 600, end: 720 }),
	"rooms.closureRemove": async (w) =>
		olga(w, "DELETE", `/rooms/${w.ids.room}/closures/${await closedRoom(w)}`),
	"bookingPause.list": (w) => olga(w, "GET", "/booking-pauses"),
	"bookingPause.create": (w) => pause(w),
	"bookingPause.update": async (w) => {
		const made = await pause(w);
		return olga(w, "PUT", `/booking-pauses/${String(made.json.id)}`, {
			scope: { level: "organisation" },
			from: LATER,
			until: LATER + 48 * HOUR,
			message: { ro: "Închis pentru inventar.", en: "Closed for stocktaking." },
			callbacksOpen: false,
			blockStaff: true,
		});
	},
	"bookingPause.remove": async (w) => {
		const made = await pause(w);
		return olga(w, "DELETE", `/booking-pauses/${String(made.json.id)}`);
	},
} satisfies Record<string, Case>;
