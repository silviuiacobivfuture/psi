import {
	DetailsSchema,
	EmailSchema,
	FIELD_LIMITS,
	NameSchema,
	PhoneSchema,
} from "@psi/scheduling/domain";
import { z } from "zod";
import { SchedulingModeSchema } from "./scheduling/port";
import { type CancelRequestOutput, ProposedSlotSchema } from "./scheduling/tools";

/**
 * Where a booking conversation stands, carried by the visitor's page from one turn to the next
 * (the engine keeps nothing). It holds the search the visitor has refined so far and the times the
 * guide last showed, so "the second one" and "Tuesday at 10" can be resolved on the next turn. It
 * carries the details the visitor gave so far (valid ones only), and it is never trusted: a time named from it is checked against the
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

/** The mandatory details of a booking, in the order the guide asks for them. */
export const DETAIL_FIELDS = ["name", "age", "details", "phone", "email"] as const;
export type DetailField = (typeof DETAIL_FIELDS)[number];

/** A stored age is a whole number of years, within the form's limits. */
const StoredAge = z.number().int().min(FIELD_LIMITS.ageMin).max(FIELD_LIMITS.ageMax);

/**
 * The details a visitor typed into the chat while a time was chosen, as far as they were
 * recognised and found valid by the very rules the booking form and the store apply
 * (`@psi/scheduling`'s fields): a value that fails them is never stored. They fill the booking form
 * again on every turn and are kept while the booking goes on (the `details` stage, and the times
 * offered again when a chosen time went), so nothing is asked twice.
 */
export const BookingDetailsSchema = z
	.object({
		name: NameSchema.optional(),
		age: StoredAge.optional(),
		details: DetailsSchema.optional(),
		phone: PhoneSchema.optional(),
		email: EmailSchema.optional(),
		forWhom: ForWhomSchema.optional(),
		consent: z.literal(true).optional(),
	})
	.strict();
export type BookingDetails = z.infer<typeof BookingDetailsSchema>;

/** The language the booking is spoken in, once the visitor's own words told it. */
export const BookingLangSchema = z.enum(["ro", "en"]);
export type BookingLang = z.infer<typeof BookingLangSchema>;

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
		/** `details`: what the chat has told so far (kept in `times` too after a time was lost). */
		details: BookingDetailsSchema.optional(),
		/**
		 * `details`: the one thing the guide asked last, so a bare answer ("34") is read as it. `confirm`
		 * means the summary is on screen and awaits the visitor's explicit yes.
		 */
		asked: z.enum([...DETAIL_FIELDS, "confirm"]).optional(),
		/** An id for this conversation's booking, minted with the details stage: one submit per slot. */
		key: z
			.string()
			.regex(/^[A-Za-z0-9_-]{8,64}$/)
			.optional(),
		/** The language the visitor wrote in; sticky across bare answers. */
		lang: BookingLangSchema.optional(),
	})
	.strict();
export type BookingState = z.infer<typeof BookingStateSchema>;

/** What a booking turn shows. The app renders each kind from its own copy. */
export type BookingKind =
	/** Free times, as buttons that open the confirm step. */
	| "times"
	/** One time the visitor picked, checked free: the details are asked one at a time. */
	| "confirm"
	/** Everything is in and valid: the summary card with its two buttons (confirm, edit). */
	| "summary"
	/** The guide submitted the request: the reference, the cancel code and what happens next. */
	| "booked"
	/** The request could not be sent (the store is down, or refused it): said plainly. */
	| "submit_failed"
	/** The visitor wants to cancel: asks for the reference and the cancel code. */
	| "cancel_ask"
	/** The outcome of a cancellation attempt. */
	| "cancel_result"
	/** The services that can be booked here. */
	| "services";

/** Why the answer to a question was not taken. */
export type DetailsProblem =
	/** The text is not a usable value for the field (or it is out of the form's limits). */
	| { field: DetailField; code: "invalid" }
	/** An e-mail whose domain is a likely typo: `suggestion` is the domain probably meant. */
	| { field: "email"; code: "typo"; suggestion: string };

/** What a `confirm` offer says about the details typed in the chat so far. */
export interface BookingDetailsReport {
	/** What is known already, every value valid. */
	values: BookingDetails;
	/** What is still needed, in the order it is asked. */
	missing: ReadonlyArray<DetailField>;
	/** What this message told (for the line that thanks the visitor). */
	heard: ReadonlyArray<DetailField | "forWhom" | "consent">;
	/** The one thing asked next (the first missing, or the field that was invalid). */
	ask?: DetailField;
	/** Why the visitor's last answer was not taken, when it was not. */
	problem?: DetailsProblem;
	/** The message told nothing: the line sends the visitor back to the question. */
	nudge: boolean;
	/** The compact form is shown, prefilled, for the visitor to finish by hand ("Edit"). */
	edit: boolean;
}

/** The request the guide submitted, as the card shows it. */
export interface BookedRequest {
	/** The name the request was made in, for the card's thanks. */
	name: string;
	reference: string;
	/** Shown once, in this card; never in the state or in the guide's memory of the turn. */
	cancelCode: string;
	/** Start of the appointment, UTC ms. */
	start: number;
	timeZone: string;
	mode: "onsite" | "online";
	practitioner: string;
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
