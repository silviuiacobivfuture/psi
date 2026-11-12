import { toLocal } from "@psi/scheduling";

/** Minutes after midnight as HH:MM. */
export function hhmm(minutes: number): string {
	return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** An instant as the tenant's wall time: `2026-11-13 10:30`. */
export function wall(instant: number, timeZone: string): string {
	const l = toLocal(instant, timeZone);
	return `${l.date} ${hhmm(l.minutes)}`;
}

/** "HH:MM" to minutes after midnight, or null. */
export function minutesOf(v: string | undefined): number | null {
	const m = /^(\d{1,2}):(\d{2})$/.exec(v ?? "");
	if (m === null) return null;
	const h = Number(m[1]);
	const min = Number(m[2]);
	return h <= 24 && min < 60 ? h * 60 + min : null;
}
