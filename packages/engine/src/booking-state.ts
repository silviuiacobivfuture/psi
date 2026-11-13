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

/** Who the appointment is for, as the booking form asks it. */
export const ForWhomSchema = z.enum(["child", "teen", "adult"]);
export type ForWhom = z.infer<typeof ForWhomSchema>;

/**
 * The details a visitor typed into the chat while a time was chosen, as far as they were
 * recognised. They fill the booking form again on every turn and live only as long as the
 * `details` stage: the state of any other stage carries none.
 */
export const BookingDetailsSchema = z
	.object({
		name: z.string().trim().min(2).max(80).optional(),
		email: z.string().trim().email().max(120).optional(),
		phone: z
			.string()
			.trim()
			.regex(/^\+?[0-9 ()-]{9,20}$/)
			.optional(),
		forWhom: ForWhomSchema.optional(),
		consent: z.literal(true).optional(),
	})
	.strict();
export type BookingDetails = z.infer<typeof BookingDetailsSchema>;

export const BookingStateSchema = z
	.object({
		/**
		 * `times`: a list is on screen; `confirm`: one time awaits the form (an older page's state);
		 * `details`: the time is `chosen` and the form is up, so free text in the chat is read for
		 * the details; `cancel`: asked for the code.
		 */
		stage: z.enum(["times", "confirm", "details", "cancel"]),
		criteria: BookingCriteriaSchema,
		/** The times last shown, in the order the visitor saw them (one per slot id). */
		shown: z.array(ProposedSlotSchema).max(MAX_SHOWN).readonly(),
		/** `details`: the time the visitor chose. It is re-checked on every turn, never trusted. */
		chosen: ProposedSlotSchema.optional(),
		/** `details`: what the chat has told so far. */
		details: BookingDetailsSchema.optional(),
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

/** What a `confirm` offer says about the details typed in the chat so far. */
export interface BookingDetailsReport {
	/** What the form shows already (and what the visitor has agreed to, by saying so). */
	values: BookingDetails;
	/** What is still needed before the one tap: `contact` is a phone or an e-mail. */
	missing: ReadonlyArray<"name" | "contact" | "forWhom" | "consent">;
	/** What this message told (for the line that thanks the visitor). */
	heard: ReadonlyArray<"name" | "phone" | "email" | "forWhom" | "consent">;
	/** The message told nothing: the line sends the visitor back to the form. */
	nudge: boolean;
}

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
