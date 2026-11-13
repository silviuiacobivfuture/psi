import { bucketOf, bucketsOf } from "./buckets";
import type { Granularity, Range, ReportAppointment, ReportFilter } from "./types";

/** Which entries a filter lets through. Absent fields filter nothing. */
export function applyFilter(
	rows: ReadonlyArray<ReportAppointment>,
	filter: ReportFilter,
): ReadonlyArray<ReportAppointment> {
	const statuses = filter.statuses === undefined ? undefined : new Set(filter.statuses);
	return rows.filter(
		(r) =>
			(filter.practitioner === undefined || r.practitioner === filter.practitioner) &&
			(filter.room === undefined || r.room === filter.room) &&
			(filter.device === undefined || r.device === filter.device) &&
			(filter.service === undefined || r.service === filter.service) &&
			(filter.client === undefined || r.client === filter.client) &&
			(filter.source === undefined || r.source === filter.source) &&
			(statuses === undefined || statuses.has(r.status)),
	);
}

/** Only entries starting inside the range. */
export function inRange(
	rows: ReadonlyArray<ReportAppointment>,
	range: Range,
): ReadonlyArray<ReportAppointment> {
	return rows.filter((r) => r.start >= range.from && r.start < range.to);
}

export const GROUPS = ["status", "service", "practitioner", "room", "device"] as const;
export type Group = (typeof GROUPS)[number];

/** The group an entry falls in; `none` when it has no practitioner / room / device. */
export function groupOf(row: ReportAppointment, group: Group): string {
	switch (group) {
		case "status":
			return row.status;
		case "service":
			return row.service;
		case "practitioner":
			return row.practitioner ?? "none";
		case "room":
			return row.room ?? "none";
		case "device":
			return row.device ?? "none";
		default: {
			const never: never = group;
			throw new Error(`unknown group ${String(never)}`);
		}
	}
}

export interface AppointmentBucket {
	bucket: string;
	total: number;
	by: Readonly<Record<string, number>>;
}

export interface AppointmentsReport {
	total: number;
	by: Readonly<Record<string, number>>;
	buckets: ReadonlyArray<AppointmentBucket>;
}

/** What the report counts by default: requests and decisions, not holds that were never submitted or lapsed. */
export const DEFAULT_STATUSES: ReadonlyArray<ReportAppointment["status"]> = [
	"requested",
	"confirmed",
	"cancelled",
	"declined",
];

/**
 * Appointments per day, week or month, split by status, service, practitioner, room or device.
 * Every bucket of the range is there, empty ones as zero. Entries outside the range are ignored.
 */
export function appointmentsReport(
	rows: ReadonlyArray<ReportAppointment>,
	range: Range,
	granularity: Granularity,
	group: Group,
	filter: ReportFilter = {},
): AppointmentsReport {
	const wanted = applyFilter(inRange(rows, range), {
		statuses: DEFAULT_STATUSES,
		...filter,
	});
	const buckets = new Map<string, { total: number; by: Map<string, number> }>(
		bucketsOf(range, granularity).map((b) => [b, { total: 0, by: new Map() }]),
	);
	const totals = new Map<string, number>();
	for (const row of wanted) {
		const bucket = buckets.get(bucketOf(row.start, range.zone, granularity));
		const key = groupOf(row, group);
		if (bucket !== undefined) {
			bucket.total += 1;
			bucket.by.set(key, (bucket.by.get(key) ?? 0) + 1);
		}
		totals.set(key, (totals.get(key) ?? 0) + 1);
	}
	const sorted = (m: Map<string, number>): Record<string, number> =>
		Object.fromEntries([...m].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
	return {
		total: wanted.length,
		by: sorted(totals),
		buckets: [...buckets].map(([bucket, v]) => ({ bucket, total: v.total, by: sorted(v.by) })),
	};
}
