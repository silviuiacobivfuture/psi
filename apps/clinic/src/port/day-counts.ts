import type { ClinicPort, DayCount } from "./port";

/**
 * The month grid's counts from the calendar itself: its live (not cancelled) visits, per day. For a port that answers
 * the calendar whole (the in-memory clinic), and for a view narrowed below what the service counts.
 */
export function countedDays(port: Pick<ClinicPort, "calendar">): ClinicPort["calendarSummary"] {
	return async (app, from, to): Promise<DayCount[]> => {
		const counts = new Map<string, number>();
		for (const a of (await port.calendar(app, from, to)).appointments)
			if (a.status !== "cancelled") counts.set(a.date, (counts.get(a.date) ?? 0) + 1);
		return [...counts]
			.map(([date, count]) => ({ date, count }))
			.sort((a, b) => a.date.localeCompare(b.date));
	};
}
