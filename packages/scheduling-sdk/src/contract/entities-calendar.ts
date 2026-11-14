import { z } from "zod/v4";
import { Appointment } from "./entities";
import { DateKey, Id, IdList, MAX_IDS, MAX_WINDOW_DAYS } from "./primitives";

export const CalendarColumn = z.enum(["person", "room", "device"]);
/**
 * A calendar window: `to` after `from`, at most MAX_WINDOW_DAYS days (a wider one is refused, never answered whole).
 * The columns a screen shows, not every calendar of the clinic: `ids` (comma-separated, at most MAX_IDS) answers only
 * those columns of the kind, `first` only the first N of them in name order, and either reads only their visits. An
 * id that names no column the caller may see is simply absent from the answer. With neither, every column is
 * answered, as before; with both, the query is refused.
 */
export const CalendarQuery = z
	.object({
		from: z.coerce.number().int().nonnegative(),
		to: z.coerce.number().int().nonnegative(),
		columns: CalendarColumn.default("person"),
		ids: IdList.optional(),
		first: z.coerce.number().int().min(1).max(MAX_IDS).optional(),
	})
	.refine((q) => q.to > q.from && q.to - q.from <= MAX_WINDOW_DAYS * 86_400_000, {
		message: `to must be after from, at most ${MAX_WINDOW_DAYS} days later`,
		path: ["to"],
	})
	.refine((q) => q.ids === undefined || q.first === undefined, {
		message: "ask for ids or for the first columns, not both",
		path: ["first"],
	});

/**
 * The calendar: each column answered with its visits. `others`, only when `ids` or `first` narrowed the answer: the
 * caller's other columns of the kind, in name order, by name only (their visits were not read), for a column picker.
 */
export const CalendarResult = z.object({
	columns: z.array(z.object({ id: Id, name: z.string(), appointments: z.array(Appointment) })),
	others: z.array(z.object({ id: Id, name: z.string() })).optional(),
});

/** A summary window: `to` after `from`, at most MAX_WINDOW_DAYS days (the month grid's six weeks fit). */
export const CalendarSummaryQuery = z
	.object({
		from: z.coerce.number().int().nonnegative(),
		to: z.coerce.number().int().nonnegative(),
	})
	.refine((q) => q.to > q.from && q.to - q.from <= MAX_WINDOW_DAYS * 86_400_000, {
		message: `to must be after from, at most ${MAX_WINDOW_DAYS} days later`,
		path: ["to"],
	});

/**
 * How many visits each day of a window holds, counted as the calendar shows them (not cancelled, not deleted, on the
 * calendars the caller may see), by local date in the app's time zone. Days with none are absent.
 */
export const CalendarSummary = z.object({
	days: z.array(z.object({ date: DateKey, count: z.number().int().positive() })),
});
