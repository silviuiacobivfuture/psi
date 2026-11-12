import { z } from "zod";
import { SchedulingModeSchema } from "./scheduling/port";
import { type CancelRequestOutput, ProposedSlotSchema } from "./scheduling/tools";

/**
 * Where a booking conversation stands, carried by the visitor's page from one turn to the next
 * (the engine keeps nothing). It holds the search the visitor has refined so far and the times the
 * guide last showed, so "the second one" and "Tuesday at 10" can be resolved on the next turn. It
 * carries no personal detail, and it is never trusted: a time named from it is checked against the
 * store again before the confirm step is shown, and the hold re-checks it once more.
 */

export const PartOfDaySchema = z.enum(["morning", "afternoon", "evening", "any"]);
export type PartOfDay = z.infer<typeof PartOfDaySchema>;

const LocalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** What the visitor asked for so far: the service, the days, the part of the day, the mode. */
export const BookingCriteriaSchema = z
	.object({
		service: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/),
		fromDate: LocalDate.optional(),
		days: z.number().int().min(1).max(14),
		weekday: z.number().int().min(1).max(7).optional(),
		partOfDay: PartOfDaySchema,
		mode: SchedulingModeSchema.optional(),
	})
	.strict();
export type BookingCriteria = z.infer<typeof BookingCriteriaSchema>;

/** The most times a state remembers (an offer shows six). */
export const MAX_SHOWN = 10;

export const BookingStateSchema = z
	.object({
		/** `times`: a list is on screen; `confirm`: one time awaits the form; `cancel`: asked for the code. */
		stage: z.enum(["times", "confirm", "cancel"]),
		criteria: BookingCriteriaSchema,
		/** The times last shown, in the order the visitor saw them (one per slot id). */
		shown: z.array(ProposedSlotSchema).max(MAX_SHOWN).readonly(),
	})
	.strict();
export type BookingState = z.infer<typeof BookingStateSchema>;

/** What a booking turn shows. The app renders each kind from its own copy. */
export type BookingKind =
	/** Free times, as buttons that open the confirm step. */
	| "times"
	/** One time the visitor picked, checked free: the confirm step (name, contact, consent). */
	| "confirm"
	/** The visitor wants to cancel: asks for the reference and the cancel code. */
	| "cancel_ask"
	/** The outcome of a cancellation attempt. */
	| "cancel_result"
	/** The services that can be booked here. */
	| "services";

/** Why a list differs from what was asked: shown so the guide can say it plainly. */
export type BookingNotice =
	/** The list follows a refinement ("next week", "mornings"). */
	| "refined"
	/** Nothing matched the refinement; these are the nearest free times. */
	| "relaxed"
	/** The picked time is no longer free; these are the nearest free times. */
	| "taken"
	/** The picked time is not among the free ones that day; these are that day's. */
	| "not_free"
	/** The text matched more than one shown time; these are the candidates. */
	| "ambiguous";

/** The result of a cancellation attempt, as the tool reports it. */
export type BookingCancel = Pick<CancelRequestOutput, "status" | "startsAt">;
