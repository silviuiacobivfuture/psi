import { z } from "zod/v4";
import { Appointment, AppointmentCreate, AppointmentPatch } from "./entities";
import { DateKey, Id } from "./primitives";

/** The most appointments one series has, the first included. */
export const MAX_SERIES_OCCURRENCES = 52;

/**
 * How a weekly series ends: after `count` appointments (the first included), or on the last day, `until`, that has
 * one. Exactly one of the two. The appointments keep the first one's wall-clock time in the app's zone, so a 10:00 is
 * 10:00 on both sides of a change of clocks.
 */
export const SeriesRecurrence = z
	.object({
		count: z.number().int().min(2).max(MAX_SERIES_OCCURRENCES).optional(),
		until: DateKey.optional(),
	})
	.refine((r) => (r.count === undefined) !== (r.until === undefined), "count or until, not both");

export const SeriesCreate = AppointmentCreate.extend({ recurrence: SeriesRecurrence });

/**
 * Which appointments of a series a change reaches: `this` one, `following` (this one and the ones after it) or `all`.
 * A change never reaches an appointment that has been attended, missed, cancelled or deleted, and `following` and
 * `all` leave the ones already past alone.
 */
export const SeriesScope = z.enum(["this", "following", "all"]);

/**
 * A change to a series: the same fields as one appointment's, applied to every appointment in scope, all or nothing.
 * A time is a time of day (`startMin`, minutes after local midnight, and `durationMin`), applied on each
 * appointment's own day, so it stays on the wall clock across a change of clocks.
 */
export const SeriesEdit = AppointmentPatch.omit({ start: true, end: true }).extend({
	occurrenceId: Id,
	scope: SeriesScope,
	startMin: z.number().int().min(0).max(1439).optional(),
	durationMin: z.number().int().min(5).max(600).optional(),
});

export const SeriesCancel = z.object({
	occurrenceId: Id,
	scope: SeriesScope,
	reason: z.string().trim().min(2).max(300),
});

export const SeriesResult = z.object({ seriesId: Id, items: z.array(Appointment) });

/**
 * One occurrence that stopped a series, as the `detail.conflicts` of the 409 that refuses it: its position (0 is the
 * first), its start, why (`overlaps` another booking of the person, room or device, `no_such_time` when the clocks
 * jump over its wall time that day, or the reason the occurrence itself cannot be changed), and what it overlaps.
 */
export const SeriesConflict = z.object({
	index: z.number().int().min(0),
	start: z.number().int().nonnegative().optional(),
	date: DateKey.optional(),
	reason: z.string(),
	with: z.enum(["practitioner", "room", "device"]).optional(),
});
export type SeriesConflictType = z.infer<typeof SeriesConflict>;
