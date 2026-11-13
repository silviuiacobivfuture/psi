import { addDays, resolveLocal, toLocal } from "../domain/time";

/** The most occurrences one series has, the first included. */
export const MAX_SERIES = 52;

/** How a weekly series ends: after `count` occurrences, or on the last day (inclusive) it has one. Exactly one is given. */
export interface Recurrence {
	count?: number | undefined;
	until?: string | undefined;
}

export interface Occurrence {
	/** 0 for the first. */
	index: number;
	start: number;
	end: number;
}

/** An occurrence that cannot be had: its wall time does not exist that day (the clocks jumped over it). */
export interface OccurrenceProblem {
	index: number;
	/** The local day it falls on, `YYYY-MM-DD`. */
	date: string;
	reason: "no_such_time";
}

export type Occurrences =
	| { ok: true; occurrences: Occurrence[] }
	| { ok: false; reason: "invalid" | "too_many"; problems?: undefined }
	| { ok: false; reason: "no_such_time"; problems: OccurrenceProblem[] };

/**
 * The weekly occurrences of an appointment, kept on the same wall-clock time in `timeZone`: a 10:00 appointment is at
 * 10:00 every week, whatever daylight saving did in between, so across a change of clocks two instants are a week
 * minus (or plus) an hour apart. The duration is elapsed time and stays what it was.
 *
 * Two wall times are not ordinary. One that happens twice (the clocks went back) is taken at its FIRST occurrence, as
 * everywhere in the service. One that does not exist (the clocks jumped over it, 03:30 on the last Sunday of March in
 * Bucharest) is NOT moved to another time: the series is refused and says which occurrence it is, because an
 * appointment silently an hour away from what was agreed is worse than one the person chooses a time for.
 */
export function weeklyOccurrences(
	first: { start: number; end: number },
	recurrence: Recurrence,
	timeZone: string,
): Occurrences {
	if ((recurrence.count === undefined) === (recurrence.until === undefined))
		return { ok: false, reason: "invalid" };
	if (first.end <= first.start) return { ok: false, reason: "invalid" };
	const origin = toLocal(first.start, timeZone);
	const length = first.end - first.start;
	let dates: string[];
	if (recurrence.count !== undefined) {
		if (!Number.isInteger(recurrence.count) || recurrence.count < 2)
			return { ok: false, reason: "invalid" };
		if (recurrence.count > MAX_SERIES) return { ok: false, reason: "too_many" };
		dates = Array.from({ length: recurrence.count }, (_, i) => addDays(origin.date, 7 * i));
	} else {
		const until = recurrence.until ?? "";
		if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || until <= origin.date)
			return { ok: false, reason: "invalid" };
		dates = [];
		for (let date = origin.date; date <= until; date = addDays(date, 7)) {
			dates.push(date);
			if (dates.length > MAX_SERIES) return { ok: false, reason: "too_many" };
		}
		if (dates.length < 2) return { ok: false, reason: "invalid" };
	}
	const occurrences: Occurrence[] = [];
	const problems: OccurrenceProblem[] = [];
	dates.forEach((date, index) => {
		if (index === 0) {
			occurrences.push({ index, start: first.start, end: first.end });
			return;
		}
		const resolved = resolveLocal(date, origin.minutes, timeZone);
		if (resolved.kind === "gap") problems.push({ index, date, reason: "no_such_time" });
		else {
			const start = resolved.kind === "exact" ? resolved.instant : resolved.earlier;
			occurrences.push({ index, start, end: start + length });
		}
	});
	if (problems.length > 0) return { ok: false, reason: "no_such_time", problems };
	return { ok: true, occurrences };
}

/**
 * The same wall time on another local day, for editing a series' time of day: `minutes` after midnight on the day the
 * instant is on, in the same zone. `undefined` when that time does not exist that day.
 */
export function atWallTime(instant: number, minutes: number, timeZone: string): number | undefined {
	const { date } = toLocal(instant, timeZone);
	const resolved = resolveLocal(date, minutes, timeZone);
	if (resolved.kind === "gap") return undefined;
	return resolved.kind === "exact" ? resolved.instant : resolved.earlier;
}
