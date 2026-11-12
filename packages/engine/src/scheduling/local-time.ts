/** How a slot reads on the wall clock where it happens: what the model is allowed to say. */
export interface WallTime {
	/** `YYYY-MM-DD` */
	date: string;
	/** `HH:MM`, 24-hour. */
	time: string;
	/** ISO weekday: Monday is 1. */
	weekday: number;
	/** Minutes after local midnight. */
	minutes: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
	const found = formatters.get(timeZone);
	if (found !== undefined) return found;
	const made = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		weekday: "short",
	});
	formatters.set(timeZone, made);
	return made;
}

const WEEKDAYS: Readonly<Record<string, number>> = {
	Mon: 1,
	Tue: 2,
	Wed: 3,
	Thu: 4,
	Fri: 5,
	Sat: 6,
	Sun: 7,
};

/** The wall time of `instant` in `timeZone`, through `Intl` (daylight saving included). */
export function wallTime(instant: number, timeZone: string): WallTime {
	const parts = formatter(timeZone).formatToParts(new Date(instant));
	const get = (type: Intl.DateTimeFormatPartTypes): string =>
		parts.find((p) => p.type === type)?.value ?? "";
	const hour = get("hour");
	const minute = get("minute");
	return {
		date: `${get("year")}-${get("month")}-${get("day")}`,
		time: `${hour}:${minute}`,
		weekday: WEEKDAYS[get("weekday")] ?? 0,
		minutes: Number(hour) * 60 + Number(minute),
	};
}

/** The calendar date `days` after `date`. */
export function addLocalDays(date: string, days: number): string {
	const [y, m, d] = date.split("-").map(Number);
	return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days)).toISOString().slice(0, 10);
}
