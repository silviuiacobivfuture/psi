import { z } from "zod";
import type { Locale } from "./i18n";

/** A calendar day from the outside: `YYYY-MM-DD` or it is refused. */
export const IsoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Calendar days are `YYYY-MM-DD`; arithmetic happens in UTC so a daylight-saving shift never moves a day. */
export function parseDay(iso: string): Date {
	const [y, m, d] = iso.split("-").map(Number);
	return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

export function isoDay(d: Date): string {
	return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
	const d = parseDay(iso);
	d.setUTCDate(d.getUTCDate() + n);
	return isoDay(d);
}

/** Monday of the week containing `iso`. */
export function weekStart(iso: string): string {
	const dow = (parseDay(iso).getUTCDay() + 6) % 7;
	return addDays(iso, -dow);
}

export function monthStart(iso: string): string {
	return `${iso.slice(0, 7)}-01`;
}

export function addMonths(iso: string, n: number): string {
	const d = parseDay(monthStart(iso));
	d.setUTCMonth(d.getUTCMonth() + n);
	return isoDay(d);
}

export function todayIso(now: Date = new Date()): string {
	// The clinic is in Galați: its day, not the server's.
	return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bucharest" }).format(now);
}

export function hhmm(min: number): string {
	const h = Math.floor(min / 60);
	const m = min % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const fmt = (locale: Locale, o: Intl.DateTimeFormatOptions, iso: string): string =>
	new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...o }).format(parseDay(iso));

export const dayLong = (l: Locale, iso: string): string =>
	fmt(l, { weekday: "long", day: "numeric", month: "long" }, iso);
export const dayShort = (l: Locale, iso: string): string =>
	fmt(l, { weekday: "short", day: "numeric" }, iso);
export const weekdayShort = (l: Locale, iso: string): string => fmt(l, { weekday: "short" }, iso);
export const monthLong = (l: Locale, iso: string): string =>
	fmt(l, { month: "long", year: "numeric" }, iso);

export function range(from: string, days: number): string[] {
	return Array.from({ length: days }, (_, i) => addDays(from, i));
}

/** Minutes after midnight in Galați right now. */
export function nowMinutes(now: Date = new Date()): number {
	const parts = new Intl.DateTimeFormat("en-GB", {
		timeZone: "Europe/Bucharest",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).formatToParts(now);
	const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? 0);
	return get("hour") * 60 + get("minute");
}
