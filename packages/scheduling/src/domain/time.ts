/**
 * Wall-clock time in an IANA zone, computed through `Intl` (the Convex runtime and Node both carry
 * the zone data), so the daylight-saving changes are the zone database's, never a hard-coded rule.
 * Instants are UTC milliseconds; a local date is `YYYY-MM-DD`; a local time is minutes after
 * midnight (0 to 1440).
 */

export const MINUTE_MS = 60_000;
export const DAY_MINUTES = 1_440;

/** A calendar date in the zone, `YYYY-MM-DD`. */
export type LocalDate = string;

/** What an instant reads as on a wall clock in a zone. */
export interface LocalParts {
	date: LocalDate;
	/** Minutes after local midnight. */
	minutes: number;
	/** ISO weekday: Monday is 1, Sunday is 7. */
	weekday: number;
}

/**
 * A local date and time resolved to instants. `gap`: the wall time does not exist that day (the
 * clocks jumped over it). `ambiguous`: it happens twice (the clocks went back); `earlier` is the
 * first occurrence.
 */
export type Resolved =
	| { kind: "exact"; instant: number }
	| { kind: "ambiguous"; earlier: number; later: number }
	| { kind: "gap" };

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
	const cached = formatters.get(timeZone);
	if (cached !== undefined) return cached;
	const created = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
	formatters.set(timeZone, created);
	return created;
}

/** True when `Intl` knows the zone. */
export function isTimeZone(timeZone: string): boolean {
	try {
		formatterFor(timeZone);
		return true;
	} catch {
		return false;
	}
}

function part(parts: ReadonlyArray<Intl.DateTimeFormatPart>, type: Intl.DateTimeFormatPartTypes) {
	const found = parts.find((p) => p.type === type);
	if (found === undefined) throw new RangeError(`Intl gave no ${type}`);
	return Number.parseInt(found.value, 10);
}

/** The wall clock of `instant` in `timeZone`, as UTC milliseconds of the same wall reading. */
function wallClock(instant: number, timeZone: string): number {
	const parts = formatterFor(timeZone).formatToParts(new Date(instant));
	return Date.UTC(
		part(parts, "year"),
		part(parts, "month") - 1,
		part(parts, "day"),
		part(parts, "hour"),
		part(parts, "minute"),
		part(parts, "second"),
	);
}

/** The zone's offset from UTC at `instant`, in minutes (Bucharest: 120 in winter, 180 in summer). */
export function offsetMinutes(instant: number, timeZone: string): number {
	const whole = Math.floor(instant / 1000) * 1000;
	return Math.round((wallClock(whole, timeZone) - whole) / MINUTE_MS);
}

function dateParts(date: LocalDate): { year: number; month: number; day: number } {
	const match = LOCAL_DATE.exec(date);
	if (match === null) throw new RangeError(`not a local date: ${date}`);
	const [, y, m, d] = match;
	const year = Number(y);
	const month = Number(m);
	const day = Number(d);
	const check = new Date(Date.UTC(year, month - 1, day));
	if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
		throw new RangeError(`not a calendar date: ${date}`);
	}
	return { year, month, day };
}

/** True for a real calendar date written `YYYY-MM-DD`. */
export function isLocalDate(value: string): boolean {
	try {
		dateParts(value);
		return true;
	} catch {
		return false;
	}
}

function formatDate(utcMidnight: number): LocalDate {
	return new Date(utcMidnight).toISOString().slice(0, 10);
}

/** The date `days` after `date` (calendar arithmetic; no zone involved). */
export function addDays(date: LocalDate, days: number): LocalDate {
	const { year, month, day } = dateParts(date);
	return formatDate(Date.UTC(year, month - 1, day + days));
}

/** ISO weekday of a calendar date: Monday is 1, Sunday is 7. */
export function weekdayOf(date: LocalDate): number {
	const { year, month, day } = dateParts(date);
	const sundayZero = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
	return sundayZero === 0 ? 7 : sundayZero;
}

/** What `instant` reads as in `timeZone`. */
export function toLocal(instant: number, timeZone: string): LocalParts {
	const wall = wallClock(instant, timeZone);
	const date = formatDate(wall - (wall % (DAY_MINUTES * MINUTE_MS)));
	const minutes = Math.floor((wall % (DAY_MINUTES * MINUTE_MS)) / MINUTE_MS);
	return { date, minutes, weekday: weekdayOf(date) };
}

/**
 * The instant(s) a local date and time names in `timeZone`. Offsets are read on both sides of the
 * wall time, so a change of offset that day yields the right candidates; a candidate counts only
 * if it reads back as the same wall time.
 */
export function resolveLocal(date: LocalDate, minutes: number, timeZone: string): Resolved {
	if (!Number.isInteger(minutes) || minutes < 0 || minutes >= DAY_MINUTES) {
		throw new RangeError(`minutes out of range: ${minutes}`);
	}
	const { year, month, day } = dateParts(date);
	const wall = Date.UTC(year, month - 1, day, 0, minutes);
	const offsets = new Set([
		offsetMinutes(wall - DAY_MINUTES * MINUTE_MS, timeZone),
		offsetMinutes(wall + DAY_MINUTES * MINUTE_MS, timeZone),
		offsetMinutes(wall, timeZone),
	]);
	const candidates = [...offsets]
		.map((offset) => wall - offset * MINUTE_MS)
		.filter((instant) => wallClock(instant, timeZone) === wall)
		.sort((a, b) => a - b);
	const [earlier, later] = [...new Set(candidates)];
	if (earlier === undefined) return { kind: "gap" };
	if (later === undefined) return { kind: "exact", instant: earlier };
	return { kind: "ambiguous", earlier, later };
}

/** The first instant of a local date (its midnight, or the first minute that exists). */
export function startOfLocalDay(date: LocalDate, timeZone: string): number {
	for (let minutes = 0; minutes < DAY_MINUTES; minutes += 1) {
		const resolved = resolveLocal(date, minutes, timeZone);
		if (resolved.kind === "exact") return resolved.instant;
		if (resolved.kind === "ambiguous") return resolved.earlier;
	}
	throw new RangeError(`no instant on ${date} in ${timeZone}`);
}

/** `HH:MM` to minutes after midnight; `24:00` is 1440 (a window ending at midnight). */
export function parseClock(clock: string): number {
	const match = /^([01]\d|2[0-4]):([0-5]\d)$/.exec(clock);
	if (match === null) throw new RangeError(`not a clock time: ${clock}`);
	const total = Number(match[1]) * 60 + Number(match[2]);
	if (total > DAY_MINUTES) throw new RangeError(`not a clock time: ${clock}`);
	return total;
}

/** Minutes after midnight to `HH:MM`. */
export function formatClock(minutes: number): string {
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
