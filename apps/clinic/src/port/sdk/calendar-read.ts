import type { SchedulingClient } from "@psi/scheduling-sdk";
import { MAX_IDS, MAX_WINDOW_DAYS } from "@psi/scheduling-sdk/contract";
import { addDays } from "../../lib/dates";
import type { CalendarFocus } from "../port";
import { instantOf } from "./time";

/** Days one calendar call asks for: the service's widest window less a day, so a DST-long day still fits. */
const WINDOW_DAYS = MAX_WINDOW_DAYS - 1;

type Answer = Awaited<ReturnType<SchedulingClient["calendar"]["get"]>>;
type Visit = Answer["columns"][number]["appointments"][number];
type Narrow = { ids?: string; first?: number };

export interface CalendarRead {
	/** Every calendar the caller may see, in name order (their colours are their places). */
	columns: ReadonlyArray<{ id: string; name: string }>;
	/** The visits read, by column: every column's, or with a focus only the focused one's. */
	visits: ReadonlyMap<string, ReadonlyArray<Visit>>;
	/** The column a focused read drew ("" when it found none); null when every column was read. */
	only: string | null;
}

/**
 * The calendar of the days `from`..`to` as the service answers it, window by window (at most MAX_WINDOW_DAYS a call).
 * With a focus, only one calendar's visits are asked: the one named when it is among the caller's (and `among`), else
 * the first that is, so a week reads one calendar's week, not the clinic's.
 */
export async function readCalendar(
	api: SchedulingClient,
	app: string,
	timeZone: string,
	from: string,
	to: string,
	focus: CalendarFocus | undefined,
): Promise<CalendarRead> {
	const windows: { from: string; to: string }[] = [];
	for (let day = from; day <= to; day = addDays(day, WINDOW_DAYS)) {
		const last = addDays(day, WINDOW_DAYS - 1);
		windows.push({ from: day, to: last < to ? last : to });
	}
	const ask = (narrow: Narrow): Promise<Answer[]> =>
		Promise.all(
			windows.map((w) =>
				api.calendar.get({
					app,
					from: instantOf(w.from, 0, timeZone),
					to: instantOf(addDays(w.to, 1), 0, timeZone),
					columns: "person",
					...narrow,
				}),
			),
		);
	const answers = focus === undefined ? await ask({}) : await focused(ask, focus);
	const first = answers[0];
	const columns = [...(first?.columns ?? []), ...(first?.others ?? [])]
		.map((c) => ({ id: c.id, name: c.name }))
		.sort((a, b) => a.name.localeCompare(b.name));
	const only = focus === undefined ? null : (first?.columns[0]?.id ?? "");
	const visits = new Map<string, Visit[]>();
	for (const answer of answers)
		for (const c of answer.columns) {
			if (only !== null && c.id !== only) continue;
			visits.set(c.id, [...(visits.get(c.id) ?? []), ...c.appointments]);
		}
	return { columns, visits, only };
}

/** The answers of a focused read: its first column is the one drawn (none: no calendar of the caller's fits). */
async function focused(
	ask: (n: Narrow) => Promise<Answer[]>,
	focus: CalendarFocus,
): Promise<Answer[]> {
	const { among } = focus;
	const fits = (id: string): boolean => among === undefined || among.has(id);
	if (focus.column !== null && fits(focus.column)) {
		const got = await ask({ ids: focus.column });
		if ((got[0]?.columns.length ?? 0) > 0) return got;
		// Not one of the caller's calendars (gone, or never theirs): the first that is.
		const next = (got[0]?.others ?? []).find((c) => fits(c.id));
		return next === undefined ? got : ask({ ids: next.id });
	}
	if (among === undefined) return ask({ first: 1 });
	const allowed = [...among].slice(0, MAX_IDS);
	// Seen as someone with no calendar: the names only, no one's visits drawn.
	if (allowed.length === 0)
		return (await ask({ first: 1 })).map((a) => ({
			columns: [],
			others: [...a.columns.map((c) => ({ id: c.id, name: c.name })), ...(a.others ?? [])],
		}));
	return ask({ ids: allowed.join(",") });
}
