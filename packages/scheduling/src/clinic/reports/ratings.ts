import { bucketOf, bucketsOf } from "./buckets";
import type { Granularity, Range, ReportFeedback } from "./types";

/**
 * Feedback ratings: how many, the average, and how many of each star, in total, per bucket, per
 * kind and per practitioner (of the visit the rating is about). Items without a rating are counted
 * apart (`withoutRating`) and by status; the average of nothing is null, not zero.
 */
export interface RatingSummary {
	count: number;
	average: number | null;
	/** Index 0 is one star, index 4 is five. */
	distribution: readonly [number, number, number, number, number];
}

const summary = (ratings: ReadonlyArray<number>): RatingSummary => {
	const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];
	for (const r of ratings) {
		const slot = distribution[r - 1];
		if (Number.isInteger(r) && slot !== undefined) distribution[r - 1] = slot + 1;
	}
	const valid = distribution.reduce((a, b) => a + b, 0);
	const sum = distribution.reduce((acc, n, i) => acc + n * (i + 1), 0);
	return { count: valid, average: valid === 0 ? null : sum / valid, distribution };
};

export interface RatingsReport {
	total: RatingSummary;
	withoutRating: number;
	byStatus: Readonly<Record<string, number>>;
	byKind: Readonly<Record<string, RatingSummary>>;
	byPractitioner: Readonly<Record<string, RatingSummary>>;
	buckets: ReadonlyArray<{ bucket: string } & RatingSummary>;
}

function group<T>(items: ReadonlyArray<T>, key: (t: T) => string | undefined): Map<string, T[]> {
	const m = new Map<string, T[]>();
	for (const i of items) {
		const k = key(i);
		if (k !== undefined) m.set(k, [...(m.get(k) ?? []), i]);
	}
	return m;
}

const sorted = <V>(m: Map<string, V>): Record<string, V> =>
	Object.fromEntries([...m].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

export function ratingsReport(
	items: ReadonlyArray<ReportFeedback>,
	range: Range,
	granularity: Granularity,
): RatingsReport {
	const mine = items.filter((i) => i.createdAt >= range.from && i.createdAt < range.to);
	const rated = mine.filter((i) => i.rating !== undefined);
	const ratingsOf = (list: ReadonlyArray<ReportFeedback>): number[] =>
		list.flatMap((i) => (i.rating === undefined ? [] : [i.rating]));
	const buckets = group(rated, (i) => bucketOf(i.createdAt, range.zone, granularity));
	return {
		total: summary(ratingsOf(rated)),
		withoutRating: mine.length - rated.length,
		byStatus: sorted(new Map([...group(mine, (i) => i.status)].map(([k, v]) => [k, v.length]))),
		byKind: sorted(
			new Map([...group(rated, (i) => i.kind)].map(([k, v]) => [k, summary(ratingsOf(v))])),
		),
		byPractitioner: sorted(
			new Map([...group(rated, (i) => i.practitioner)].map(([k, v]) => [k, summary(ratingsOf(v))])),
		),
		buckets: bucketsOf(range, granularity).map((bucket) => ({
			bucket,
			...summary(ratingsOf(buckets.get(bucket) ?? [])),
		})),
	};
}
