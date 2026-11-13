import { applyFilter, inRange } from "./appointments";
import { bucketOf, bucketsOf } from "./buckets";
import type { Granularity, Range, ReportAppointment, ReportFilter } from "./types";

/**
 * New against returning clients. A client is NEW in the range when none of their bookings started
 * before it (`priorClients` holds the clients that had one); their first booking in the range puts
 * them in the `new` count of that bucket, and every later bucket they appear in counts them as
 * returning. A client who had a booking before the range is returning in every bucket they appear
 * in. Only confirmed entries naming a client count; each client counts once per bucket.
 */
export interface ClientBucket {
	bucket: string;
	new: number;
	returning: number;
}

export interface ClientsReport {
	/** Distinct clients with a confirmed booking in the range. */
	active: number;
	new: number;
	returning: number;
	buckets: ReadonlyArray<ClientBucket>;
}

export function clientsReport(
	rows: ReadonlyArray<ReportAppointment>,
	priorClients: ReadonlySet<string>,
	range: Range,
	granularity: Granularity,
	filter: ReportFilter = {},
): ClientsReport {
	const mine = applyFilter(inRange(rows, range), { ...filter, statuses: ["confirmed"] })
		.filter((r) => r.client !== undefined)
		.sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1));
	const buckets = new Map<string, { new: Set<string>; returning: Set<string> }>(
		bucketsOf(range, granularity).map((b) => [b, { new: new Set(), returning: new Set() }]),
	);
	const firstBucket = new Map<string, string>();
	for (const r of mine) {
		const client = r.client ?? "";
		const bucket = bucketOf(r.start, range.zone, granularity);
		const first = firstBucket.get(client) ?? bucket;
		firstBucket.set(client, first);
		const target = buckets.get(bucket);
		if (target === undefined) continue;
		if (!priorClients.has(client) && first === bucket) target.new.add(client);
		else target.returning.add(client);
	}
	const clients = new Set(mine.map((r) => r.client ?? ""));
	const fresh = [...clients].filter((c) => !priorClients.has(c)).length;
	return {
		active: clients.size,
		new: fresh,
		returning: clients.size - fresh,
		buckets: [...buckets].map(([bucket, v]) => ({
			bucket,
			new: v.new.size,
			returning: v.returning.size,
		})),
	};
}
