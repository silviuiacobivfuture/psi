/** Minutes after midnight as HH:MM. */
export function hhmm(minutes: number): string {
	return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** "HH:MM" as minutes after midnight, or null. */
export function toMinutes(value: string): number | null {
	const m = /^(\d{1,2}):(\d{2})$/.exec(value);
	if (m === null) return null;
	const h = Number(m[1]);
	const min = Number(m[2]);
	return h <= 23 && min < 60 ? h * 60 + min : null;
}

/** An instant as the tenant's wall date, `2026-11-13`. */
export function wallDate(instant: number, timeZone: string): string {
	return new Intl.DateTimeFormat("en-CA", { timeZone }).format(instant);
}

/** An instant as the tenant's wall time, `10:30`. */
export function wallTime(instant: number, timeZone: string): string {
	return new Intl.DateTimeFormat("en-GB", {
		timeZone,
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).format(instant);
}

/** A local date as a short, readable day in the editor's language: "joi, 13 nov.". */
export function dayLabel(date: string, language: string): string {
	return new Intl.DateTimeFormat(language === "en" ? "en-GB" : "ro-RO", {
		weekday: "short",
		day: "numeric",
		month: "short",
		timeZone: "UTC",
	}).format(new Date(`${date}T00:00:00Z`));
}

/** Two ranges of minutes overlap (touching ones do not). */
export function overlaps(
	a: { start: number; end: number },
	b: { start: number; end: number },
): boolean {
	return a.start < b.end && b.start < a.end;
}
