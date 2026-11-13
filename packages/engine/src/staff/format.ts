import type { StaffCopy } from "./copy";

const MINUTES_PER_DAY = 1440;

/** `HH:MM` for minutes after midnight (1440 reads as 24:00). */
export function clock(min: number): string {
	const hours = Math.floor(min / 60);
	const minutes = min % 60;
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function clockRange(startMin: number, durationMin: number): string {
	return `${clock(startMin)}–${clock(Math.min(startMin + durationMin, MINUTES_PER_DAY))}`;
}

/** The weekday and day of a calendar date in the copy's language: "marți, 17 nov." */
export function dateLabel(copy: StaffCopy, date: string): string {
	return new Intl.DateTimeFormat(copy.intl, {
		weekday: "long",
		day: "numeric",
		month: "short",
		timeZone: "UTC",
	}).format(new Date(`${date}T00:00:00Z`));
}

export function weekdayName(copy: StaffCopy, date: string): string {
	return new Intl.DateTimeFormat(copy.intl, {
		weekday: "long",
		timeZone: "UTC",
	}).format(new Date(`${date}T00:00:00Z`));
}

/** Bani as lei, in the copy's number format: "1.250,00 lei". */
export function money(copy: StaffCopy, bani: number): string {
	return `${new Intl.NumberFormat(copy.intl, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(bani / 100)} lei`;
}

export function addDays(date: string, days: number): string {
	const [y, m, d] = date.split("-").map(Number);
	return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days)).toISOString().slice(0, 10);
}

/** Today's calendar date in a time zone. */
export function todayIn(timeZone: string, now: number): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date(now));
	return parts;
}

/** The Monday of the week a date is in. */
export function weekStart(date: string): string {
	const day = new Date(`${date}T00:00:00Z`).getUTCDay();
	return addDays(date, -((day + 6) % 7));
}

/** Folds a name for matching: lower case, no diacritics. */
export function foldName(text: string): string {
	return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Minutes after local midnight now, in a time zone. */
export function minutesNowIn(timeZone: string, now: number): number {
	const parts = new Intl.DateTimeFormat("en-GB", {
		timeZone,
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).formatToParts(new Date(now));
	const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? 0);
	return get("hour") * 60 + get("minute");
}
