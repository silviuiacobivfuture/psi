import { z } from "zod/v4";
import { DateKey, Id, Ms } from "./primitives";

/**
 * A practitioner's availability (docs/plans/clinic.md): the weekly rules the public site's free times are made of, and
 * one-off days (closed all day, closed for part of it, or extra hours). Times are minutes after local midnight in the
 * app's zone (`timeZone`, Europe/Bucharest), so 09:00 stays 09:00 across a daylight-saving change; dates are calendar
 * dates. A refusal of a save names its reason in `detail.problems` (each `{ reason, index? | date? }`), and nothing is
 * written.
 */
export const AvailabilityMode = z.enum(["onsite", "online"]);
/** Minutes after midnight; 1440 ends a window at midnight. */
export const ClockMinutes = z.number().int().min(0).max(1440);

export const AvailabilityRule = z.object({
	/** ISO weekday: Monday 1 .. Sunday 7. */
	weekday: z.number().int().min(1).max(7),
	start: ClockMinutes,
	end: ClockMinutes,
	modes: z.array(AvailabilityMode).min(1).max(2),
	/** First and last date the rule applies (inclusive); absent is open-ended. */
	validFrom: DateKey.optional(),
	validUntil: DateKey.optional(),
	/** Only in alternating week A or B; absent is every week. */
	week: z.enum(["A", "B"]).optional(),
	/** A period schedule: on its dates it replaces the regular week. Needs `validFrom`. */
	override: z.boolean().optional(),
});

export const AvailabilityException = z.object({
	id: z.string(),
	date: DateKey,
	kind: z.enum(["closed", "open"]),
	/** Both or neither; neither on `closed` is the whole day. */
	start: ClockMinutes.optional(),
	end: ClockMinutes.optional(),
	modes: z.array(AvailabilityMode).optional(),
});

export const Availability = z.object({
	personId: Id,
	timeZone: z.string(),
	/** A Monday: its week is week A of the alternating rules; absent when the person has none. */
	abAnchor: DateKey.optional(),
	rules: z.array(AvailabilityRule),
	/** One-off days from the date asked on, in date order. */
	exceptions: z.array(AvailabilityException),
});

/** The most rules one save carries (the store's own bound). */
export const MAX_AVAILABILITY_RULES = 120;

export const AvailabilityRulesPut = z.object({
	rules: z.array(AvailabilityRule).max(MAX_AVAILABILITY_RULES),
});

/** A one-off entry: one date or a range, closed (whole day or part of it) or open for extra hours. */
export const OneOffEntry = z.object({
	from: DateKey,
	until: DateKey.optional(),
	kind: z.enum(["closed", "open"]),
	start: ClockMinutes.optional(),
	end: ClockMinutes.optional(),
	modes: z.array(AvailabilityMode).max(2).optional(),
});

/** The most practitioners one bulk change names. */
export const MAX_BULK_PEOPLE = 50;

export const OneOffCreate = z.object({
	/** Everyone it applies to: all of them get it, or none does. */
	personIds: z.array(Id).min(1).max(MAX_BULK_PEOPLE),
	entry: OneOffEntry,
});
export const OneOffCreated = z.object({
	items: z.array(z.object({ personId: Id, added: z.number().int() })),
});

export const RulesCopy = z.object({
	/** Whose weekly rules are copied. */
	from: Id,
	/** Whose weekly rules they replace: all of them, or none. */
	to: z.array(Id).min(1).max(MAX_BULK_PEOPLE),
});
export const RulesCopied = z.object({
	items: z.array(z.object({ personId: Id, rules: z.number().int() })),
});

/** The widest preview: a week, and a day either side for the zone. */
export const MAX_PREVIEW_DAYS = 8;

export const AvailabilityPreviewQuery = z.object({
	service: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/),
	from: z.coerce.number().int().nonnegative(),
	to: z.coerce.number().int().nonnegative(),
});

/** What the public site offers of this person for this service: the same slots, computed by the same code. */
export const AvailabilityPreview = z.object({
	personId: Id,
	timeZone: z.string(),
	service: z.object({
		slug: z.string(),
		durationMinutes: z.number().int(),
		holdMinutes: z.number().int(),
	}),
	from: Ms,
	to: Ms,
	slots: z.array(z.object({ start: Ms, end: Ms, modes: z.array(AvailabilityMode) })),
	/** Whether online booking is paused for this person or service right now: the site then offers none of these. */
	paused: z.boolean(),
});

/** A room's closed time: a date (or range), the whole day or part of it. */
export const RoomClosure = z.object({
	id: z.string(),
	date: DateKey,
	start: ClockMinutes.optional(),
	end: ClockMinutes.optional(),
});
export const RoomClosureCreate = z.object({
	from: DateKey,
	until: DateKey.optional(),
	start: ClockMinutes.optional(),
	end: ClockMinutes.optional(),
});
