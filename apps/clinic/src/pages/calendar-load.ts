import type { Ctx } from "../lib/context";
import { todayIso } from "../lib/dates";
import type { CalendarData } from "../port/port";
import type { Appointment } from "../port/schema";
import type { ClientFlag } from "../port/schema-clinical";
import { type CalendarQuery, columnsFor, rangeFor } from "./calendar-query";

export interface CalendarView {
	data: CalendarData | null;
	/** The month's visits counted per day (the month grid reads counts, never its visits); null on the day and week. */
	days: ReadonlyMap<string, number> | null;
	failed: boolean;
}

/**
 * The flags of the clients on the tiles: blacklist for who may see it, the newest pinned note for who may read its
 * category. A refusal or a service that keeps no notes yet leaves the tiles plain, never the calendar broken.
 */
async function flagsFor(
	ctx: Ctx,
	appointments: ReadonlyArray<Appointment>,
): Promise<Readonly<Record<string, ClientFlag>>> {
	if (!ctx.can.any("blacklist_view", "clients_view")) return {};
	const ids = [...new Set(appointments.flatMap((a) => (a.clientId === null ? [] : [a.clientId])))];
	if (ids.length === 0) return {};
	try {
		const flags = await ctx.port.clientFlags(ctx.app, ids);
		return Object.fromEntries(
			Object.entries(flags).map(([id, f]) => [
				id,
				{
					blacklist: ctx.can.has("blacklist_view") ? f.blacklist : null,
					pinned:
						f.pinned === null || (f.pinned.category === "clinical" && !ctx.can.group("clinical"))
							? null
							: f.pinned,
				},
			]),
		);
	} catch {
		return {};
	}
}

/** The month: the counts per day and the calendars' names (for the print sheet), no visit read one by one. */
async function loadMonth(ctx: Ctx, from: string, to: string): Promise<CalendarView> {
	const [days, columns] = await Promise.all([
		ctx.port.calendarSummary(ctx.app, from, to),
		ctx.port.columns(ctx.app).catch(() => []),
	]);
	return {
		data: { columns, appointments: [], clients: [], services: [] },
		days: new Map(days.map((d) => [d.date, d.count])),
		failed: false,
	};
}

/** The calendar's data for a query, as the grid shows it (an error is a state of the grid, not a crash). */
export async function loadCalendar(ctx: Ctx, query: CalendarQuery): Promise<CalendarView> {
	const date = query.date === "" ? todayIso() : query.date;
	const { from, to } = rangeFor(query.view, date);
	try {
		if (query.view === "month") return await loadMonth(ctx, from, to);
		// The week draws one calendar (the chosen one, else the first the filter shows): only its visits are read on.
		const all = await ctx.port.calendar(
			ctx.app,
			from,
			to,
			query.view === "week"
				? (cols) => {
						const shown = cols.filter((c) => columnsFor(query.cat, c));
						return (shown.find((c) => c.id === query.col) ?? shown[0])?.id;
					}
				: undefined,
		);
		const columns = all.columns.filter((c) => columnsFor(query.cat, c));
		const shown = new Set(columns.map((c) => c.id));
		const appointments = all.appointments.filter((a) => shown.has(a.columnId));
		return {
			data: {
				...all,
				columns,
				appointments,
				flags: await flagsFor(ctx, appointments),
			},
			days: null,
			failed: false,
		};
	} catch {
		return { data: null, days: null, failed: true };
	}
}
