import { type DayException, type Mode, ruleProblem, type WeeklyRule } from "./catalog";
import { addDays, DAY_MINUTES, isLocalDate, type LocalDate, resolveLocal } from "./time";

/**
 * Validation of what the availability editor saves: a practitioner's whole set of weekly rules, and one-off entries (a
 * date or a range of dates closed all day, closed for part of the day, or open for extra hours). Every problem is a
 * stable reason code with the index of the rule it is about; the console words it (Romanian first), the service
 * refuses with it and writes nothing.
 */

/** The bounds an availability plan stays within. */
export const AVAILABILITY_LIMITS = {
	/** Weekly rules of one practitioner. */
	rules: 120,
	/** Intervals of one weekday within one schedule. */
	intervalsPerDay: 6,
	/** Days one one-off entry spans. */
	entryDays: 92,
	/** Times are on this grid of minutes. */
	gridMinutes: 5,
	/** One-off entries one practitioner keeps (one row per date). */
	exceptions: 1000,
} as const;

export const PLAN_REASONS = [
	"too_many",
	"weekday",
	"end_before_start",
	"out_of_day",
	"grid",
	"no_mode",
	"bad_date",
	"validity",
	"period_start",
	"too_many_intervals",
	"overlap",
] as const;
export type PlanReason = (typeof PLAN_REASONS)[number];

/** One problem of a weekly plan: which rule (`index`), and for an overlap the rule it overlaps (`other`). */
export interface PlanProblem {
	reason: PlanReason;
	index?: number;
	other?: number;
}

const onGrid = (minutes: number): boolean => minutes % AVAILABILITY_LIMITS.gridMinutes === 0;

/** `ruleProblem`'s answer (the one rule check every writer shares) as a reason the editor words. */
function reasonOf(rule: WeeklyRule, problem: string): PlanReason {
	switch (problem) {
		case "weekday":
			return "weekday";
		case "times":
			return Number.isInteger(rule.start) &&
				Number.isInteger(rule.end) &&
				rule.start >= 0 &&
				rule.end <= DAY_MINUTES
				? "end_before_start"
				: "out_of_day";
		case "a rule needs a mode":
			return "no_mode";
		case "a period needs a start":
			return "period_start";
		default:
			return "validity";
	}
}

/** The problems of one rule alone, before it is compared with the others: `ruleProblem`, real dates, the grid. */
function ruleAlone(rule: WeeklyRule): PlanReason | undefined {
	const dates = [rule.validFrom, rule.validUntil].filter((d) => d !== undefined);
	if (dates.some((d) => !isLocalDate(d))) return "bad_date";
	const problem = ruleProblem(rule);
	if (problem !== undefined) return reasonOf(rule, problem);
	if (!onGrid(rule.start) || !onGrid(rule.end)) return "grid";
	return undefined;
}

/** Two validity ranges share a date (an absent bound is open). */
function datesMeet(a: WeeklyRule, b: WeeklyRule): boolean {
	const aFrom = a.validFrom ?? "0000-01-01";
	const bFrom = b.validFrom ?? "0000-01-01";
	const aUntil = a.validUntil ?? "9999-12-31";
	const bUntil = b.validUntil ?? "9999-12-31";
	return aFrom <= bUntil && bFrom <= aUntil;
}

/**
 * Two rules collide when they can open the same minutes on the same date: the same weekday, overlapping times, validity
 * ranges that share a date, weeks that can be the same (A, B, or every week), and the same kind (a period schedule
 * replaces the regular week on its dates, so a period and a regular rule never collide).
 */
function collide(a: WeeklyRule, b: WeeklyRule): boolean {
	if (a.weekday !== b.weekday) return false;
	if (!(a.start < b.end && b.start < a.end)) return false;
	if (!datesMeet(a, b)) return false;
	if (a.week !== undefined && b.week !== undefined && a.week !== b.week) return false;
	return (a.override === true) === (b.override === true);
}

/** Rules of one schedule (the same dates, week and kind) and weekday: what "intervals of a day" counts. */
const scheduleKey = (r: WeeklyRule): string =>
	[r.weekday, r.validFrom ?? "", r.validUntil ?? "", r.week ?? "", r.override === true].join("|");

/**
 * Every problem of a practitioner's whole set of weekly rules, in rule order: each rule's own first, then each overlap
 * once (the later rule names the earlier one). An empty list means the set can be saved.
 */
export function weeklyPlanProblems(rules: ReadonlyArray<WeeklyRule>): PlanProblem[] {
	if (rules.length > AVAILABILITY_LIMITS.rules) return [{ reason: "too_many" }];
	const problems: PlanProblem[] = [];
	const sound: number[] = [];
	rules.forEach((rule, index) => {
		const reason = ruleAlone(rule);
		if (reason === undefined) sound.push(index);
		else problems.push({ reason, index });
	});
	const perDay = new Map<string, number[]>();
	for (const index of sound) {
		const rule = rules[index];
		if (rule === undefined) continue;
		const key = scheduleKey(rule);
		perDay.set(key, [...(perDay.get(key) ?? []), index]);
	}
	for (const indexes of perDay.values()) {
		const last = indexes[AVAILABILITY_LIMITS.intervalsPerDay];
		if (last !== undefined) problems.push({ reason: "too_many_intervals", index: last });
	}
	for (let i = 0; i < sound.length; i += 1) {
		for (let j = i + 1; j < sound.length; j += 1) {
			const a = sound[i];
			const b = sound[j];
			if (a === undefined || b === undefined) continue;
			const ra = rules[a];
			const rb = rules[b];
			if (ra !== undefined && rb !== undefined && collide(ra, rb)) {
				problems.push({ reason: "overlap", index: b, other: a });
			}
		}
	}
	return problems;
}

/** A one-off entry as the editor sends it: one date, or a range, closed (all day or part of it) or open for extra hours. */
export interface OneOffEntry {
	from: LocalDate;
	/** The last date (inclusive); absent means `from` alone. */
	until?: LocalDate;
	kind: "closed" | "open";
	/** Minutes after midnight; both or neither. Neither on `closed` closes the whole day. */
	start?: number;
	end?: number;
	/** For `open`: the modes the extra hours offer (every mode when absent). */
	modes?: ReadonlyArray<Mode>;
}

export const ENTRY_REASONS = [
	"bad_date",
	"range_order",
	"range_too_long",
	"times_pair",
	"open_needs_hours",
	"end_before_start",
	"out_of_day",
	"grid",
	"no_mode",
	"dst_gap",
	"duplicate",
	"overlap",
	"day_closed",
	"too_many",
] as const;
export type EntryReason = (typeof ENTRY_REASONS)[number];

/** A problem of a one-off entry, and the date it is about when it is one date of the range. */
export interface EntryProblem {
	reason: EntryReason;
	date?: LocalDate;
}

/** The dates [from, until] of an entry, in order (calendar dates: no zone, so no daylight-saving drift). */
export function entryDates(entry: Pick<OneOffEntry, "from" | "until">): LocalDate[] {
	const last = entry.until ?? entry.from;
	const dates: LocalDate[] = [];
	for (let d = entry.from; d <= last && dates.length <= AVAILABILITY_LIMITS.entryDays; ) {
		dates.push(d);
		d = addDays(d, 1);
	}
	return dates;
}

function entryShape(entry: OneOffEntry): EntryReason | undefined {
	if (!isLocalDate(entry.from) || (entry.until !== undefined && !isLocalDate(entry.until)))
		return "bad_date";
	if (entry.until !== undefined && entry.until < entry.from) return "range_order";
	if (entryDates(entry).length > AVAILABILITY_LIMITS.entryDays) return "range_too_long";
	if ((entry.start === undefined) !== (entry.end === undefined)) return "times_pair";
	if (entry.kind === "open" && entry.start === undefined) return "open_needs_hours";
	if (entry.start !== undefined && entry.end !== undefined) {
		const { start, end } = entry;
		if (!Number.isInteger(start) || !Number.isInteger(end)) return "out_of_day";
		if (start < 0 || end > DAY_MINUTES) return "out_of_day";
		if (end <= start) return "end_before_start";
		if (!onGrid(start) || !onGrid(end)) return "grid";
	}
	if (entry.modes !== undefined && entry.modes.length === 0) return "no_mode";
	return undefined;
}

/** True when a wall time does not exist on that date (the hour the clocks skip in spring). */
function inGap(date: LocalDate, minutes: number, timeZone: string): boolean {
	if (minutes >= DAY_MINUTES) return false;
	return resolveLocal(date, minutes, timeZone).kind === "gap";
}

const spansMeet = (a: DayException, b: { start: number; end: number }): boolean =>
	a.start !== undefined && a.end !== undefined && a.start < b.end && b.start < a.end;

/** What an entry's day says against the entries already on that date, or undefined when it fits. */
function againstDay(entry: OneOffEntry, day: ReadonlyArray<DayException>): EntryReason | undefined {
	const wholeDayClosed = day.some((e) => e.kind === "closed" && e.start === undefined);
	if (entry.kind === "closed" && entry.start === undefined)
		return wholeDayClosed ? "duplicate" : undefined;
	if (wholeDayClosed) return "day_closed";
	if (entry.start === undefined || entry.end === undefined) return undefined;
	const span = { start: entry.start, end: entry.end };
	const same = day.some(
		(e) => e.kind === entry.kind && e.start === span.start && e.end === span.end,
	);
	if (same) return "duplicate";
	return day.some((e) => e.kind === entry.kind && spansMeet(e, span)) ? "overlap" : undefined;
}

/**
 * Every problem of a one-off entry: its shape first (then nothing else is asked), then per date a time that does not
 * exist that day in `timeZone` (the spring change) and a clash with the entries already there (`existing`, any dates).
 * An empty list means it can be added.
 */
export function oneOffProblems(
	entry: OneOffEntry,
	existing: ReadonlyArray<DayException>,
	timeZone: string,
): EntryProblem[] {
	const shape = entryShape(entry);
	if (shape !== undefined) return [{ reason: shape }];
	const dates = entryDates(entry);
	if (existing.length + dates.length > AVAILABILITY_LIMITS.exceptions)
		return [{ reason: "too_many" }];
	const problems: EntryProblem[] = [];
	for (const date of dates) {
		const gap =
			entry.start !== undefined &&
			entry.end !== undefined &&
			(inGap(date, entry.start, timeZone) || inGap(date, entry.end, timeZone));
		if (gap) problems.push({ reason: "dst_gap", date });
		const clash = againstDay(
			entry,
			existing.filter((e) => e.date === date),
		);
		if (clash !== undefined) problems.push({ reason: clash, date });
	}
	return problems;
}

/** The rows an entry becomes: one per date, in the shape the slot logic reads. */
export function entryRows(entry: OneOffEntry): DayException[] {
	return entryDates(entry).map((date) => ({
		date,
		kind: entry.kind,
		...(entry.start === undefined ? {} : { start: entry.start }),
		...(entry.end === undefined ? {} : { end: entry.end }),
		...(entry.kind === "open" && entry.modes !== undefined ? { modes: [...entry.modes] } : {}),
	}));
}
