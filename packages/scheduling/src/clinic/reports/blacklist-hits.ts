import { bucketOf, bucketsOf } from "./buckets";
import type { Granularity, Range, ReportBlacklistEvent } from "./types";

/**
 * What the blacklist did: online requests refused and staff overrides, in total, per bucket, by
 * severity, category, channel and the identifier that matched, and the entries hit most (by id).
 * A warning shown to staff and then refused writes nothing, so it is not counted here.
 */
export interface BlacklistHitsReport {
	total: number;
	refused: number;
	overridden: number;
	bySeverity: Readonly<Record<string, number>>;
	byCategory: Readonly<Record<string, number>>;
	byChannel: Readonly<Record<string, number>>;
	byMatch: Readonly<Record<string, number>>;
	byAuthority: Readonly<Record<string, number>>;
	topEntries: ReadonlyArray<{ entry: string; hits: number }>;
	buckets: ReadonlyArray<{ bucket: string; refused: number; overridden: number }>;
}

const TOP = 10;

function tally(values: ReadonlyArray<string>): Record<string, number> {
	const m = new Map<string, number>();
	for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
	return Object.fromEntries([...m].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

export function blacklistHitsReport(
	events: ReadonlyArray<ReportBlacklistEvent>,
	range: Range,
	granularity: Granularity,
): BlacklistHitsReport {
	const mine = events.filter((e) => e.at >= range.from && e.at < range.to);
	const buckets = new Map(
		bucketsOf(range, granularity).map((b) => [b, { refused: 0, overridden: 0 }]),
	);
	for (const e of mine) {
		const b = buckets.get(bucketOf(e.at, range.zone, granularity));
		if (b === undefined) continue;
		if (e.kind === "online_refused") b.refused += 1;
		else b.overridden += 1;
	}
	const perEntry = tally(mine.map((e) => e.entry));
	return {
		total: mine.length,
		refused: mine.filter((e) => e.kind === "online_refused").length,
		overridden: mine.filter((e) => e.kind === "overridden").length,
		bySeverity: tally(mine.map((e) => e.severity)),
		byCategory: tally(mine.map((e) => e.category)),
		byChannel: tally(mine.map((e) => e.channel)),
		byMatch: tally(mine.map((e) => e.matchedBy)),
		byAuthority: tally(mine.flatMap((e) => (e.authority === undefined ? [] : [e.authority]))),
		topEntries: Object.entries(perEntry)
			.sort(([ia, a], [ib, b]) => b - a || (ia < ib ? -1 : 1))
			.slice(0, TOP)
			.map(([entry, hits]) => ({ entry, hits })),
		buckets: [...buckets].map(([bucket, v]) => ({ bucket, ...v })),
	};
}
