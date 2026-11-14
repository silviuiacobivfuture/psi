import { z } from "zod/v4";
import { Ms, Subject } from "./primitives";

/** The days of the week, Monday first, as the opening hours name them. */
export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const Clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const Text = (max: number) => z.string().trim().min(1).max(max);
/** An address on the web the profile links to: https only, a real URL. */
const Https = z
	.string()
	.trim()
	.max(500)
	.regex(/^https:\/\/\S+$/)
	.refine((s) => URL.canParse(s), "not a URL");

/** One stretch of a day the organisation is open: it closes after it opens, on the same day. */
export const OpeningSpan = z
	.object({ open: Clock, close: Clock })
	.refine((s) => s.open < s.close, "closes before it opens");

/** A day the organisation is open, with its stretches in order and apart; a day not listed is closed. */
export const OpeningDay = z
	.object({ day: z.enum(WEEKDAYS), spans: z.array(OpeningSpan).min(1).max(3) })
	.refine(
		(d) => d.spans.every((s, i) => i === 0 || (d.spans[i - 1]?.close ?? "") <= s.open),
		"the stretches of a day overlap or are out of order",
	);

export const OrgPhone = z.object({
	/** As it is dialled or shown: digits, spaces, a leading +, dots, dashes, brackets. */
	number: z
		.string()
		.trim()
		.regex(/^\+?[0-9][0-9 ().-]{5,24}$/),
	/** What the number is for ("Recepție"); absent: the general number. */
	label: Text(60).optional(),
});

export const OrgAddress = z.object({
	street: Text(200).optional(),
	city: Text(100).optional(),
	county: Text(100).optional(),
	/** Romania's six-digit code. */
	postalCode: z
		.string()
		.trim()
		.regex(/^\d{6}$/)
		.optional(),
});

/**
 * How the public reaches the organisation and who it is legally: what its sites' contact pages and footers show, and what
 * a message to a visitor may point to (the phone while online booking is paused). Every field is the owners' to leave
 * unset; the first phone is the main one.
 */
export const OrgProfile = z
	.object({
		legalName: Text(200).optional(),
		/** The fiscal code (CUI / CIF), with or without the RO of a VAT payer. */
		cui: z
			.string()
			.trim()
			.regex(/^(RO)?\d{2,10}$/)
			.optional(),
		address: OrgAddress.optional(),
		phones: z.array(OrgPhone).max(5),
		email: z.email().max(200).optional(),
		website: Https.optional(),
		/** A map's link to the address (Google Maps, OpenStreetMap). */
		mapUrl: Https.optional(),
		/** The logo's image, served over https. */
		logoUrl: Https.optional(),
		hours: z.array(OpeningDay).max(7),
		/** What the hours alone do not say ("Sâmbăta doar cu programare"). */
		hoursNote: Text(300).optional(),
	})
	.refine((p) => new Set(p.hours.map((d) => d.day)).size === p.hours.length, "a day given twice");
export type OrgProfileType = z.output<typeof OrgProfile>;

/** A profile nobody filled in: no phone, no hours. */
export const EMPTY_ORG_PROFILE: OrgProfileType = { phones: [], hours: [] };

/** What an app has stored: nothing yet (revision 0), or the profile with who saved it last and when. */
export const OrgProfileDoc = z.object({
	revision: z.number().int().min(0),
	profile: OrgProfile.optional(),
	updatedAt: Ms.optional(),
	updatedBy: Subject.optional(),
});

/**
 * A save carries the whole profile and the revision it was edited from. The stored one moving on is a 409 (`conflict`,
 * detail `reason: "stale"` and the stored `revision`), never an overwrite; a save stores revision + 1.
 */
export const OrgProfilePut = z.object({ revision: z.number().int().min(0), profile: OrgProfile });

/** The organisation as a public site shows it: its name and the contact profile (absent while none is saved). */
export const PublicContact = z.object({ name: z.string(), profile: OrgProfile.optional() });
