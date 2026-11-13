import { applyFilter, inRange } from "./appointments";
import type { Range, ReportAppointment, ReportFilter } from "./types";

/**
 * No-show and cancellation rates.
 *
 * A BOOKING is an entry that was confirmed at some point and was not just refused: `confirmed` or
 * `cancelled`. Requests still waiting, declined ones, holds and lapsed holds are not bookings.
 *   cancellation rate = cancelled / bookings
 * An OUTCOME is known for a confirmed staff-made visit that has ended: `attended` or `absent`;
 * one still `pending` after it ended is unmarked (a gap in the data, reported, not guessed).
 *   no-show rate = absent / (attended + absent)
 * Web bookings carry no attendance, so they count in cancellations only.
 */
export interface Rates {
	bookings: number;
	cancelled: number;
	cancellationRate: number | null;
	attended: number;
	absent: number;
	/** Confirmed visits that ended with no attendance marked. */
	unmarked: number;
	noShowRate: number | null;
}

export interface ClientRates {
	client: string;
	bookings: number;
	cancelled: number;
	attended: number;
	absent: number;
	cancellationRate: number | null;
	noShowRate: number | null;
}

const ratio = (part: number, whole: number): number | null => (whole === 0 ? null : part / whole);

function tally(rows: ReadonlyArray<ReportAppointment>, now: number) {
	let bookings = 0;
	let cancelled = 0;
	let attended = 0;
	let absent = 0;
	let unmarked = 0;
	for (const r of rows) {
		if (r.status !== "confirmed" && r.status !== "cancelled") continue;
		bookings += 1;
		if (r.status === "cancelled") {
			cancelled += 1;
			continue;
		}
		if (r.source !== "visit" || r.end > now) continue;
		if (r.attendance === "attended") attended += 1;
		else if (r.attendance === "absent") absent += 1;
		else unmarked += 1;
	}
	return { bookings, cancelled, attended, absent, unmarked };
}

export function ratesReport(
	rows: ReadonlyArray<ReportAppointment>,
	range: Range,
	now: number,
	filter: ReportFilter = {},
): Rates {
	const t = tally(applyFilter(inRange(rows, range), filter), now);
	return {
		...t,
		cancellationRate: ratio(t.cancelled, t.bookings),
		noShowRate: ratio(t.absent, t.attended + t.absent),
	};
}

/**
 * The same rates per client, for entries that name one, worst first: most no-shows, then most
 * cancellations, then the id. `minBookings` leaves out clients with too few bookings to mean
 * anything (default 1).
 */
export function ratesByClient(
	rows: ReadonlyArray<ReportAppointment>,
	range: Range,
	now: number,
	options: { filter?: ReportFilter; minBookings?: number } = {},
): ReadonlyArray<ClientRates> {
	const wanted = applyFilter(inRange(rows, range), options.filter ?? {}).filter(
		(r) => r.client !== undefined,
	);
	const groups = new Map<string, ReportAppointment[]>();
	for (const r of wanted) {
		const id = r.client ?? "";
		groups.set(id, [...(groups.get(id) ?? []), r]);
	}
	const out: ClientRates[] = [];
	for (const [client, list] of groups) {
		const t = tally(list, now);
		if (t.bookings < (options.minBookings ?? 1)) continue;
		out.push({
			client,
			bookings: t.bookings,
			cancelled: t.cancelled,
			attended: t.attended,
			absent: t.absent,
			cancellationRate: ratio(t.cancelled, t.bookings),
			noShowRate: ratio(t.absent, t.attended + t.absent),
		});
	}
	return out.sort(
		(a, b) =>
			b.absent - a.absent ||
			b.cancelled - a.cancelled ||
			(a.client < b.client ? -1 : a.client > b.client ? 1 : 0),
	);
}
