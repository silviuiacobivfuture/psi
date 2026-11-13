import { z } from "zod";
import type { BookingCopy, BookingEnv, BookingErrors, BookingLocale, BookingValues } from "./types";

/** A booking request carries logistics only: never health details, never free text. */
export const BookingRequest = z
	.object({
		name: z.string().trim().min(2).max(80),
		email: z.union([z.string().trim().email().max(120), z.literal("")]).default(""),
		phone: z
			.union([
				z
					.string()
					.trim()
					.regex(/^\+?[0-9 ()-]{9,20}$/),
				z.literal(""),
			])
			.default(""),
		forWhom: z.enum(["child", "teen", "adult"]),
		when: z.enum(["morning", "afternoon", "any"]).default("any"),
		/** A free slot's id when scheduling is on; empty (or absent) means "call me back". */
		slot: z.string().max(120).default(""),
		/** The service the slot is for; empty means the store's default. */
		service: z.union([z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/), z.literal("")]).default(""),
		/** "1" when the form is the booking page's (service cards), so every step re-renders it so. */
		cards: z.enum(["1", ""]).catch(""),
		consent: z.literal("yes"),
	})
	.refine((v) => v.email !== "" || v.phone !== "", { path: ["contact"] });

/** The confirm step's form: the hold it confirms and the contact typed in the first step. */
export const BookingConfirmation = z.object({
	reference: z.string().trim().min(8).max(12),
	holdToken: z.string().trim().min(16).max(64),
	name: z.string().trim().min(2).max(80),
	email: z.string().trim().max(120).default(""),
	phone: z.string().trim().max(20).default(""),
	forWhom: z.enum(["child", "teen", "adult"]),
	when: z.enum(["morning", "afternoon", "any"]).default("any"),
	/** The held slot's start (UTC ms), carried so a failed confirm still tells the team the time. */
	start: z.union([z.string().regex(/^[0-9]{10,15}$/), z.literal("")]).default(""),
	consent: z.literal("yes"),
});

/**
 * Which booking form a request belongs to: the site's page, or the one inside the guide's
 * conversation (the compass can open it on any page). Every step answers with the same id, so
 * Datastar patches the form that was sent and never the other one.
 */
export const FormIdSchema = z
	.string()
	.regex(/^(?:booking|chat-booking(?:-[a-z0-9]{4,12})?)$/)
	.catch("booking");

/**
 * A form body as the site's audiences read it: a site that serves one audience never asks, so
 * what the browser sent for it is replaced by that audience (never trusted either way).
 */
export function withAudience(
	raw: Readonly<Record<string, string>>,
	env: BookingEnv,
): Record<string, string> {
	const only = env.audiences.length === 1 ? env.audiences[0] : undefined;
	return only === undefined ? { ...raw } : { ...raw, forWhom: only };
}

/** The prefix of a form's field ids, so two forms in one page never share an id. */
export function fieldPrefix(id: string): string {
	return id === "booking" ? "b" : id.replace("chat-booking", "cb");
}

const INTL_LOCALE: Readonly<Record<BookingLocale, string>> = {
	ro: "ro-RO",
	en: "en-GB",
};

/** "marți, 18 noiembrie" and "10:15", in the practice's zone (daylight saving included). */
export function wallClock(
	start: number,
	timeZone: string,
	locale: BookingLocale,
): { day: string; time: string } {
	const tag = INTL_LOCALE[locale];
	const day = new Intl.DateTimeFormat(tag, {
		timeZone,
		weekday: "long",
		day: "numeric",
		month: "long",
	}).format(start);
	const time = new Intl.DateTimeFormat(tag, {
		timeZone,
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).format(start);
	return { day, time };
}

/** Maps the parser's issues to the field errors a person reads. */
export function errorsFor(
	issues: ReadonlyArray<z.ZodIssue>,
	copy: BookingCopy,
	values: BookingValues,
): BookingErrors {
	const errors: BookingErrors = {};
	for (const issue of issues) {
		const field = issue.path[0];
		if (field === "name") errors.name = copy.errors.name;
		else if (field === "email" || field === "phone" || field === "contact")
			errors.contact = copy.errors.contact;
		else if (field === "forWhom") errors.forWhom = copy.errors.forWhom;
		else if (field === "consent") errors.consent = copy.errors.consent;
	}
	// The either-or rule runs only once every field parses, so check it directly as well.
	if ((values.email ?? "").trim() === "" && (values.phone ?? "").trim() === "")
		errors.contact = copy.errors.contact;
	return errors;
}
