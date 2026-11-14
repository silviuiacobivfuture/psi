import { z } from "zod";
import { addDays, addMonths, IsoDay, monthStart, parseDay, weekStart } from "../lib/dates";

export const PERIODS = ["today", "week", "month", "last-month", "last-30", "custom"] as const;
export type Period = (typeof PERIODS)[number];

export interface Span {
	from: string;
	to: string;
}

const blank = (v: unknown): unknown => (v === "" ? undefined : v);

/** What the statistics URL may carry: every field optional and checked; a comparison is on unless it says `0`. */
export const StatsQuerySchema = z.object({
	period: z.preprocess(blank, z.enum(PERIODS).default("month")),
	from: z.preprocess(blank, IsoDay.optional()),
	to: z.preprocess(blank, IsoDay.optional()),
	compare: z.preprocess(blank, z.enum(["0", "1"]).default("1")),
	person: z.preprocess(blank, z.string().min(1).max(100).optional()),
});
export type StatsQuery = z.infer<typeof StatsQuerySchema>;

const lastDay = (iso: string): string => addDays(addMonths(monthStart(iso), 1), -1);
const dayCount = (s: Span): number =>
	Math.round((parseDay(s.to).getTime() - parseDay(s.from).getTime()) / 86_400_000) + 1;

/** The period a query names, on `today`. A custom period with a missing end is the one day it has; a reversed one is put right. */
export function spanOf(q: Pick<StatsQuery, "period" | "from" | "to">, today: string): Span {
	switch (q.period) {
		case "today":
			return { from: today, to: today };
		case "week": {
			const from = weekStart(today);
			return { from, to: addDays(from, 6) };
		}
		case "month":
			return { from: monthStart(today), to: lastDay(today) };
		case "last-month": {
			const from = addMonths(monthStart(today), -1);
			return { from, to: lastDay(from) };
		}
		case "last-30":
			return { from: addDays(today, -29), to: today };
		case "custom": {
			const a = q.from ?? q.to ?? today;
			const b = q.to ?? q.from ?? today;
			return a <= b ? { from: a, to: b } : { from: b, to: a };
		}
		default: {
			const never: never = q.period;
			return never;
		}
	}
}

/** The period to compare with: the calendar month before a whole month, else the same number of days just before. */
export function previousOf(s: Span): Span {
	if (s.from === monthStart(s.from) && s.to === lastDay(s.from)) {
		const from = addMonths(s.from, -1);
		return { from, to: lastDay(from) };
	}
	const n = dayCount(s);
	return { from: addDays(s.from, -n), to: addDays(s.from, -1) };
}

/** The most days a custom period may span; a longer one is cut to it from its start. */
export const MAX_SPAN_DAYS = 366;
export function clamp(s: Span): Span {
	return dayCount(s) <= MAX_SPAN_DAYS
		? s
		: { from: s.from, to: addDays(s.from, MAX_SPAN_DAYS - 1) };
}
