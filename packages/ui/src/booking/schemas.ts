import { AgeSchema, DetailsSchema, EmailSchema, NameSchema, PhoneSchema } from "@psi/scheduling";
import { z } from "zod";
import type { BookingCopy, BookingEnv, BookingErrors, BookingLocale } from "./types";

const Audience = z.enum(["child", "teen", "adult"]);
const Period = z.enum(["morning", "afternoon", "any"]);

/**
 * A booking request: who is asking and what is going on, every field mandatory and validated by
 * the shared rules (@psi/scheduling's `fields`), the single source the client's attributes mirror.
 * For a child the guardian is the contact; the age is the child's. The details are the person's
 * own words: personal data, kept with the contact and erased with it.
 */
export const BookingRequest = z.object({
	name: NameSchema,
	age: AgeSchema,
	details: DetailsSchema,
	phone: PhoneSchema,
	email: EmailSchema,
	forWhom: Audience,
	when: Period.default("any"),
	/** A free slot's id when scheduling is on; empty (or absent) means "call me back". */
	slot: z.string().max(120).default(""),
	/** The service the slot is for; empty means the store's default. */
	service: z.union([z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/), z.literal("")]).default(""),
	/** "1" when the form is the booking page's (service cards), so every step re-renders it so. */
	cards: z.enum(["1", ""]).catch(""),
	consent: z.literal("yes"),
});

/** The confirm step's form: the hold it confirms and the details typed in the first step. */
export const BookingConfirmation = z.object({
	reference: z.string().trim().min(8).max(12),
	holdToken: z.string().trim().min(16).max(64),
	name: NameSchema,
	age: AgeSchema,
	details: DetailsSchema,
	phone: PhoneSchema,
	email: EmailSchema,
	forWhom: Audience,
	when: Period.default("any"),
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

/** Maps the parser's issues to the field errors a person reads: one per field, the first issue wins. */
export function errorsFor(issues: ReadonlyArray<z.ZodIssue>, copy: BookingCopy): BookingErrors {
	const errors: BookingErrors = {};
	for (const issue of issues) {
		const field = issue.path[0];
		if (field === "name") errors.name ??= copy.errors.name;
		else if (field === "age") errors.age ??= copy.errors.age;
		else if (field === "details") errors.details ??= copy.errors.details;
		else if (field === "phone") errors.phone ??= copy.errors.phone;
		else if (field === "email") {
			errors.email ??= issue.message.startsWith("typo:")
				? copy.errors.emailTypo(issue.message.slice(5))
				: copy.errors.email;
		} else if (field === "forWhom") errors.forWhom ??= copy.errors.forWhom;
		else if (field === "consent") errors.consent ??= copy.errors.consent;
	}
	return errors;
}
