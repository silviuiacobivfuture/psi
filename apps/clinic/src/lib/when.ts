import type { Locale } from "../lib/i18n";

/** The service records instants in UTC; a stored string without a zone is read as UTC too. */
export const instantOf = (at: string): Date =>
	new Date(/[zZ]|[+-]\d\d:\d\d$/.test(at) ? at : `${at}Z`);

export function absolute(at: string, locale: Locale, timeZone: string): string {
	return new Intl.DateTimeFormat(locale, {
		dateStyle: "long",
		timeStyle: "medium",
		timeZone,
	}).format(instantOf(at));
}

export function short(at: string, locale: Locale, timeZone: string): string {
	return new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone,
	}).format(instantOf(at));
}

const STEPS: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
	["year", 31_536_000],
	["month", 2_592_000],
	["week", 604_800],
	["day", 86_400],
	["hour", 3_600],
	["minute", 60],
];

/** "acum 3 ore", "ieri": how long ago, in the largest whole unit. */
export function relative(at: string, locale: Locale, now: Date = new Date()): string {
	const seconds = Math.round((instantOf(at).getTime() - now.getTime()) / 1000);
	const abs = Math.abs(seconds);
	const fmt = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
	for (const [unit, size] of STEPS) {
		if (abs >= size) return fmt.format(Math.trunc(seconds / size), unit);
	}
	return fmt.format(0, "second");
}
