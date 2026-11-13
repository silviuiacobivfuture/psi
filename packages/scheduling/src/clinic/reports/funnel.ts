import { bucketOf, bucketsOf } from "./buckets";
import type { Granularity, Range, ReportWebRequest } from "./types";

/**
 * The web and chat funnel, request to booking. Every row is one visitor's hold of a slot:
 *   started     held a slot (the row exists);
 *   submitted   confirmed the hold into a request (it has a submit time);
 *   booked      the team confirmed it;
 *   declined / cancelled   the team declined it, or either side cancelled it after the request;
 *   lapsed      never submitted (released or expired).
 * `requestToBooked` = booked / submitted. A booking cancelled later shows as cancelled (the store
 * keeps one status), so it does not count as booked: the rate is the share that STAYED booked.
 * Rows are those held in the range; staff-made bookings (channel `staff`) are not part of a funnel.
 */
export interface Funnel {
	started: number;
	submitted: number;
	booked: number;
	declined: number;
	cancelled: number;
	pending: number;
	lapsed: number;
	submitRate: number | null;
	requestToBooked: number | null;
}

const ratio = (a: number, b: number): number | null => (b === 0 ? null : a / b);

function count(rows: ReadonlyArray<ReportWebRequest>): Funnel {
	let submitted = 0;
	let booked = 0;
	let declined = 0;
	let cancelled = 0;
	let pending = 0;
	let lapsed = 0;
	for (const r of rows) {
		if (r.submittedAt === undefined) {
			lapsed += r.status === "held" ? 0 : 1;
			continue;
		}
		submitted += 1;
		if (r.status === "confirmed") booked += 1;
		else if (r.status === "declined") declined += 1;
		else if (r.status === "cancelled") cancelled += 1;
		else pending += 1;
	}
	return {
		started: rows.length,
		submitted,
		booked,
		declined,
		cancelled,
		pending,
		lapsed,
		submitRate: ratio(submitted, rows.length),
		requestToBooked: ratio(booked, submitted),
	};
}

export interface FunnelReport {
	total: Funnel;
	byChannel: Readonly<Record<string, Funnel>>;
	buckets: ReadonlyArray<{ bucket: string } & Pick<Funnel, "started" | "submitted" | "booked">>;
}

export function funnelReport(
	rows: ReadonlyArray<ReportWebRequest>,
	range: Range,
	granularity: Granularity,
): FunnelReport {
	const mine = rows.filter(
		(r) => r.channel !== "staff" && r.created >= range.from && r.created < range.to,
	);
	const channels = new Map<string, ReportWebRequest[]>();
	for (const r of mine) channels.set(r.channel, [...(channels.get(r.channel) ?? []), r]);
	const buckets = new Map<string, ReportWebRequest[]>(
		bucketsOf(range, granularity).map((b) => [b, []]),
	);
	for (const r of mine) buckets.get(bucketOf(r.created, range.zone, granularity))?.push(r);
	return {
		total: count(mine),
		byChannel: Object.fromEntries(
			[...channels].sort(([a], [b]) => (a < b ? -1 : 1)).map(([c, list]) => [c, count(list)]),
		),
		buckets: [...buckets].map(([bucket, list]) => {
			const f = count(list);
			return { bucket, started: f.started, submitted: f.submitted, booked: f.booked };
		}),
	};
}
