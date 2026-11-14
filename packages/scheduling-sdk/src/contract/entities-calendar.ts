import { z } from "zod/v4";
import { DateKey, MAX_WINDOW_DAYS } from "./primitives";

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
