import {
	addDays,
	DAY_MINUTES,
	type LocalDate,
	resolveLocal,
	startOfLocalDay,
	toLocal,
	weekdayOf,
} from "../../domain/time";
import { type Granularity, MAX_RANGE_DAYS, type Range } from "./types";

/**
 * Time buckets in the app's zone: a day is `YYYY-MM-DD`, a week is the date of its Monday, a
 * month is `YYYY-MM`. An instant belongs to the bucket of its LOCAL date, so a day the clocks
 * change (23 or 25 hours) is still one day, and a visit at 00:30 local belongs to its own date
 * whatever the UTC date says.
 */
export function bucketOf(instant: number, zone: string, granularity: Granularity): string {
	const date = toLocal(instant, zone).date;
	return bucketOfDate(date, granularity);
}

export function bucketOfDate(date: LocalDate, granularity: Granularity): string {
	if (granularity === "day") return date;
	if (granularity === "month") return date.slice(0, 7);
	return addDays(date, 1 - weekdayOf(date));
}

export type RangeProblem = "invalid_range" | "range_too_long";

/** Why a range cannot be reported on, or undefined. */
export function rangeProblem(range: Range): RangeProblem | undefined {
	if (!Number.isFinite(range.from) || !Number.isFinite(range.to) || range.to <= range.from) {
		return "invalid_range";
	}
	// A year and a day of calendar time at most, measured in local dates (a DST year is not 366 x 24 h).
	const first = toLocal(range.from, range.zone).date;
	const last = toLocal(range.to - 1, range.zone).date;
	return daysBetween(first, last) + 1 > MAX_RANGE_DAYS ? "range_too_long" : undefined;
}

export function daysBetween(a: LocalDate, b: LocalDate): number {
	return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Every local date of the range, first to last. */
export function datesOf(range: Range): ReadonlyArray<LocalDate> {
	const first = toLocal(range.from, range.zone).date;
	const last = toLocal(range.to - 1, range.zone).date;
	const out: LocalDate[] = [];
	for (let n = daysBetween(first, last), i = 0; i <= n; i += 1) out.push(addDays(first, i));
	return out;
}

/** Every bucket the range touches, in order, so an empty bucket shows as zero rather than missing. */
export function bucketsOf(range: Range, granularity: Granularity): ReadonlyArray<string> {
	const seen = new Set<string>();
	for (const date of datesOf(range)) seen.add(bucketOfDate(date, granularity));
	return [...seen];
}

/**
 * The instant of a wall time on a date. 24:00 is the next midnight; a time the clocks skip
 * resolves to the first instant after the gap; a time that happens twice takes the first.
 */
export function instantAt(date: LocalDate, minutes: number, zone: string): number {
	if (minutes >= DAY_MINUTES) return startOfLocalDay(addDays(date, 1), zone);
	for (let m = minutes; m < DAY_MINUTES; m += 1) {
		const r = resolveLocal(date, m, zone);
		if (r.kind === "exact") return r.instant;
		if (r.kind === "ambiguous") return r.earlier;
	}
	return startOfLocalDay(addDays(date, 1), zone);
}

/** The part of `[a, b)` inside `[from, to)`, in minutes of real time. */
export function overlapMinutes(a: number, b: number, from: number, to: number): number {
	return Math.max(0, Math.min(b, to) - Math.max(a, from)) / 60_000;
}
