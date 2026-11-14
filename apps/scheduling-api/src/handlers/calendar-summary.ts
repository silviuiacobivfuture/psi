import { startOfLocalDay } from "@psi/scheduling/domain";
import { reaches } from "../authz/access";
import type { HandlersOf } from "../http/context";
import { localDate } from "./reminders";
import { addDaysKey, must } from "./shared";

/** The first instant of each local day from the one holding `from` until the one holding `to - 1`, and their dates. */
function daysOf(from: number, to: number, timeZone: string): { date: string; start: number }[] {
	const out: { date: string; start: number }[] = [];
	for (let date = localDate(from, timeZone); ; date = addDaysKey(date, 1)) {
		const start = startOfLocalDay(date, timeZone);
		if (start >= to) break;
		out.push({ date, start });
	}
	return out;
}

/** The index of the last day starting at or before `instant` (the days are in order; the first starts at or before `from`). */
function dayIndex(days: ReadonlyArray<{ start: number }>, instant: number): number {
	let lo = 0;
	let hi = days.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if ((days[mid]?.start ?? Number.POSITIVE_INFINITY) <= instant) lo = mid;
		else hi = mid - 1;
	}
	return lo;
}

export const calendarSummaryHandlers: HandlersOf<"calendar.summary"> = {
	/**
	 * What calendar.get would show for the window, counted per local day instead of answered visit by visit: the same
	 * read (the window's visits by their start), the same rule (live, not cancelled, an active person's calendar within
	 * the caller's reach).
	 */
	async "calendar.summary"(ctx) {
		const s = ctx.deps.store.c;
		const { from, to } = ctx.query;
		const [app, people, inRange] = await Promise.all([
			must(s.apps, ctx.app, ctx.app, "app"),
			s.people.list(ctx.app),
			s.appointments.list(ctx.app, { range: { field: "start", gte: from, lt: to } }),
		]);
		const shown = new Set(
			people.filter((p) => p.active && reaches(ctx.reach, p.id)).map((p) => p.id),
		);
		const days = daysOf(from, to, app.timeZone);
		const counts = new Array<number>(days.length).fill(0);
		for (const a of inRange) {
			if (a.deletedAt !== undefined || a.status === "cancelled" || !shown.has(a.practitionerId))
				continue;
			const i = dayIndex(days, a.start);
			counts[i] = (counts[i] ?? 0) + 1;
		}
		return {
			days: days.flatMap((d, i) => {
				const count = counts[i] ?? 0;
				return count === 0 ? [] : [{ date: d.date, count }];
			}),
		};
	},
};
