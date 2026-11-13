import { dayMonth, parseDay, weekStart } from "../lib/dates";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { Figures } from "../port/report-schema";

/** A whole percentage, or null when there is nothing to divide by. */
export const percent = (part: number, whole: number): number | null =>
	whole === 0 ? null : Math.round((100 * part) / whole);

export const pctText = (p: number | null, locale: Locale): string =>
	p === null ? "—" : `${new Intl.NumberFormat(locale).format(p)}%`;

export const hours = (min: number, locale: Locale): string =>
	new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(min / 60);

export const num = (n: number, locale: Locale): string => new Intl.NumberFormat(locale).format(n);

export type DeltaKind = "count" | "points";

/** How far a figure moved from the previous period, in words that carry the direction (not by colour alone). */
export function deltaText(
	current: number | null,
	previous: number | null,
	kind: DeltaKind,
	locale: Locale,
): string {
	const o = at(locale);
	if (current === null || previous === null) return "—";
	if (current === previous) return m.st_delta_same({}, o);
	const sign = current > previous ? "+" : "−";
	if (kind === "points") return `${sign}${Math.abs(current - previous)} pp`;
	if (previous === 0) return m.st_delta_new({}, o);
	return `${sign}${Math.round((100 * Math.abs(current - previous)) / previous)}%`;
}

export interface TrendPoint {
	label: string;
	date: string;
	value: number;
	previous?: number;
}

const WEEKLY_AFTER = 62;

/** The trend as columns: a column a day, or a column a week once the period is long; aligned with the previous period. */
export function trendOf(
	current: Figures,
	previous: Figures | null,
	locale: Locale,
): { weekly: boolean; points: TrendPoint[] } {
	const weekly = current.byDay.length > WEEKLY_AFTER;
	const slots = (f: Figures): Array<{ date: string; value: number }> => {
		if (!weekly) return f.byDay.map((d) => ({ date: d.date, value: d.appointments }));
		const sums = new Map<string, number>();
		for (const d of f.byDay) {
			const key = weekStart(d.date);
			sums.set(key, (sums.get(key) ?? 0) + d.appointments);
		}
		return [...sums].map(([date, value]) => ({ date, value }));
	};
	const before = previous === null ? null : slots(previous);
	return {
		weekly,
		points: slots(current).map((s, i) => ({
			date: s.date,
			value: s.value,
			label: weekly ? dayMonth(locale, s.date) : String(parseDay(s.date).getUTCDate()),
			...(before === null ? {} : { previous: before[i]?.value ?? 0 }),
		})),
	};
}

/** "13 nov – 19 nov 2026": a period said in a line. */
export const spanText = (from: string, to: string, locale: Locale): string =>
	from === to
		? new Intl.DateTimeFormat(locale, { timeZone: "UTC", dateStyle: "long" }).format(parseDay(from))
		: m.st_showing(
				{
					from: new Intl.DateTimeFormat(locale, { timeZone: "UTC", dateStyle: "medium" }).format(
						parseDay(from),
					),
					to: new Intl.DateTimeFormat(locale, { timeZone: "UTC", dateStyle: "medium" }).format(
						parseDay(to),
					),
				},
				at(locale),
			);
