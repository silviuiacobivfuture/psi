import type { Range, ReportAppointment } from "../clinic/reports/types";
import { wallToInstant } from "../clinic/visits";

/** Builders for the report tests: synthetic rows in Europe/Bucharest. */
export const ZONE = "Europe/Bucharest";
export const MIN = 60_000;
export const HOUR = 3_600_000;

export function at(date: string, clock: string): number {
	const r = wallToInstant(date, clock, ZONE);
	if (!r.ok) throw new Error(`${date} ${clock}: ${r.problem}`);
	return r.instant;
}

/** A range of whole local days, `[first 00:00, day after last 00:00)`. */
export function days(first: string, lastInclusive: string): Range {
	const next = new Date(Date.parse(`${lastInclusive}T00:00:00Z`) + 86_400_000)
		.toISOString()
		.slice(0, 10);
	return { from: at(first, "00:00"), to: at(next, "00:00"), zone: ZONE };
}

let counter = 0;
export function entry(
	date: string,
	from: string,
	to: string,
	over: Partial<ReportAppointment> = {},
): ReportAppointment {
	counter += 1;
	return {
		id: `e${counter}`,
		source: "visit",
		start: at(date, from),
		end: at(date, to),
		status: "confirmed",
		attendance: "pending",
		service: "ABA",
		practitioner: "p1",
		...over,
	};
}
