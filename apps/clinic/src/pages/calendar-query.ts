import { z } from "zod";
import { addDays, monthStart, weekStart } from "../lib/dates";
import { type Column, IsoDateSchema } from "../port/schema";

export const ViewSchema = z.enum(["day", "week", "month"]);
export type View = z.infer<typeof ViewSchema>;

export const CATEGORY_FILTERS = ["team", "therapy", "neuro", "all"] as const;
export type CategoryFilter = (typeof CATEGORY_FILTERS)[number];
const CategoryFilterSchema = z.enum(CATEGORY_FILTERS);

export const CalendarQuerySchema = z.object({
	view: ViewSchema.catch("day"),
	date: IsoDateSchema.catch(""),
	col: z.string().optional(),
	new: z.string().optional(),
	time: z
		.string()
		.regex(/^\d{2}:\d{2}$/)
		.optional(),
	appt: z.string().max(40).optional(),
	/** A client to start the new appointment with. */
	client: z.string().max(40).optional(),
	/** Which columns: the team (people, devices, groups), the therapy rooms, the neuro rooms, or all of them. */
	cat: CategoryFilterSchema.catch("team"),
});
export type CalendarQuery = z.infer<typeof CalendarQuerySchema>;

/** The columns a filter shows: rooms are shown by their category, everything else belongs to the team. */
export function columnsFor(cat: CategoryFilter, c: Column): boolean {
	if (cat === "all") return true;
	if (cat === "team") return c.kind !== "room";
	return c.kind === "room" && c.category === cat;
}

export function rangeFor(view: View, date: string): { from: string; to: string } {
	if (view === "day") return { from: date, to: date };
	if (view === "week") return { from: weekStart(date), to: addDays(weekStart(date), 6) };
	const start = weekStart(monthStart(date));
	return { from: start, to: addDays(start, 41) };
}
