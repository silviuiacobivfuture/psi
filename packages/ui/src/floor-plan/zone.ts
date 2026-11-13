/** Wall-clock days of one time zone, from instants (epoch ms). The plan needs only day bounds, the clock and the week. */

const formatters = new Map<string, Intl.DateTimeFormat>();

function parts(instant: number, timeZone: string): Record<string, number> {
	let f = formatters.get(timeZone);
	if (f === undefined) {
		f = new Intl.DateTimeFormat("en-GB", {
			timeZone,
			hourCycle: "h23",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});
		formatters.set(timeZone, f);
	}
	const out: Record<string, number> = {};
	for (const p of f.formatToParts(new Date(instant))) {
		if (p.type !== "literal") out[p.type] = Number(p.value);
	}
	return out;
}

/** The zone's offset from UTC at `instant`, in ms (east is positive). */
export function offsetMs(instant: number, timeZone: string): number {
	const p = parts(instant, timeZone);
	const asUtc = Date.UTC(
		p.year ?? 0,
		(p.month ?? 1) - 1,
		p.day ?? 1,
		p.hour ?? 0,
		p.minute ?? 0,
		p.second ?? 0,
	);
	return asUtc - Math.floor(instant / 1000) * 1000;
}

export type LocalDate = string;

export function addDays(date: LocalDate, days: number): LocalDate {
	const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
	return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The instant the zone's wall clock reads 00:00 on `date`. */
export function dayStart(date: LocalDate, timeZone: string): number {
	const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
	const guess = Date.UTC(y, m - 1, d);
	const first = guess - offsetMs(guess, timeZone);
	return guess - offsetMs(first, timeZone);
}

/** The half-open real-time span of a local day: 23, 24 or 25 hours long. */
export function dayRange(date: LocalDate, timeZone: string): { start: number; end: number } {
	return { start: dayStart(date, timeZone), end: dayStart(addDays(date, 1), timeZone) };
}

export function dateOf(instant: number, timeZone: string): LocalDate {
	const p = parts(instant, timeZone);
	const pad = (n: number | undefined): string => String(n ?? 0).padStart(2, "0");
	return `${String(p.year ?? 0).padStart(4, "0")}-${pad(p.month)}-${pad(p.day)}`;
}

/** "HH:MM" on the zone's wall clock. */
export function clockOf(instant: number, timeZone: string): string {
	const p = parts(instant, timeZone);
	return `${String(p.hour ?? 0).padStart(2, "0")}:${String(p.minute ?? 0).padStart(2, "0")}`;
}

/** The Monday of the week holding `date`. */
export function mondayOf(date: LocalDate): LocalDate {
	const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
	const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
	return addDays(date, -((dow + 6) % 7));
}

export const MINUTE = 60_000;
