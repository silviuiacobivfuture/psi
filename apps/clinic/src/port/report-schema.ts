import { z } from "zod";
import { IsoDateSchema } from "./schema";

/** What a statistics screen asks: a period, the period before it to compare with, and optionally one person. */
export const ReportQuerySchema = z.object({
	from: IsoDateSchema,
	to: IsoDateSchema,
	/** The comparison period (same length, just before); absent: no comparison is asked. */
	compare: z.object({ from: IsoDateSchema, to: IsoDateSchema }).optional(),
	/** Narrow every figure to one calendar person (the therapist drill-down). */
	personId: z.string().min(1).optional(),
});
export type ReportQuery = z.infer<typeof ReportQuerySchema>;

const Count = z.number().int().nonnegative();
const Bani = z.number().int().nonnegative();

const Slice = z.object({
	id: z.string(),
	name: z.string(),
	appointments: Count,
	/** `null`: the service does not split this figure by the slice (only the whole clinic's is known). */
	attended: Count.nullable(),
	cancelled: Count.nullable(),
	noShow: Count.nullable(),
	bookedMin: Count,
	/** `null`: the person may not see money. */
	revenueBani: Bani.nullable(),
});
export type ReportSlice = z.infer<typeof Slice>;

/** One period's figures. Every list is already in the order a screen shows it. */
export const FiguresSchema = z.object({
	from: IsoDateSchema,
	to: IsoDateSchema,
	/** Visits scheduled in the period that were not cancelled. */
	appointments: Count,
	attended: Count,
	cancelled: Count,
	noShow: Count,
	bookedMin: Count,
	/** Minutes the team was on the roster (or the default working week when nothing was rostered). */
	capacityMin: Count,
	/** `null`: the service cannot say it for one person alone. */
	newClients: Count.nullable(),
	returningClients: Count.nullable(),
	revenueBani: Bani.nullable(),
	requests: Count,
	/** Web requests of the period that became a visit. */
	requestsConverted: Count,
	byDay: z.array(z.object({ date: IsoDateSchema, appointments: Count, cancelled: Count })),
	byPerson: z.array(Slice),
	byService: z.array(Slice),
	byRoom: z.array(Slice),
	/** Appointments by weekday (0 = Monday) and starting hour (0..23). */
	heat: z.array(z.array(Count).length(24)).length(7),
});
export type Figures = z.infer<typeof FiguresSchema>;

/** Right now, whatever the period: today, this week and this month, and the packages as they stand. */
export const SnapshotSchema = z.object({
	today: Count,
	week: Count,
	month: Count,
	packagesActive: Count,
	/** Active packages with at most two sessions left (or none unused). */
	packagesEnding: Count.nullable(),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

export const ReportSchema = z.object({
	snapshot: SnapshotSchema,
	current: FiguresSchema,
	previous: FiguresSchema.nullable(),
});
export type Report = z.infer<typeof ReportSchema>;
