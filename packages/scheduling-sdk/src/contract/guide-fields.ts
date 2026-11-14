import { z } from "zod/v4";

/**
 * What a booking made through the visitor assistant (`channel: "guide"` on submit) must carry, checked by the service
 * before anything is written: the five fields the assistant asks for. A booking from the site's form (`channel:
 * "form"`, the default) is held to the form's own rule (a name and one way to call back): the form does not ask for an
 * age or a problem, and a visitor using it is never refused for not having typed what they were not asked.
 *
 * One refusal reason per field and per way it can be wrong (`detail.reason` of a 400 `invalid`, with `detail.field`).
 */
export const GUIDE_REQUIRED_FIELDS = ["name", "age", "details", "phone", "email"] as const;
export type GuideField = (typeof GUIDE_REQUIRED_FIELDS)[number];

export const GUIDE_FIELD_REFUSALS = [
	"name_missing",
	"name_invalid",
	"age_missing",
	"age_invalid",
	"details_missing",
	"details_invalid",
	"phone_missing",
	"phone_invalid",
	"email_missing",
	"email_invalid",
] as const;
export const GuideFieldRefusal = z.enum(GUIDE_FIELD_REFUSALS);
export type GuideFieldRefusal = z.infer<typeof GuideFieldRefusal>;

/** The bounds, the same as the booking form's for the fields both have. */
export const GUIDE_FIELD_LIMITS = {
	nameMin: 2,
	nameMax: 80,
	ageMin: 0,
	ageMax: 120,
	detailsMin: 3,
	detailsMax: 2000,
	emailMax: 120,
} as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9 ()-]{9,20}$/;

export interface GuideFieldsInput {
	contact: { name: string; email?: string | undefined; phone?: string | undefined };
	age?: number | undefined;
	details?: string | undefined;
}

function nameRefusal(raw: string): GuideFieldRefusal | undefined {
	const name = raw.trim();
	if (name === "") return "name_missing";
	return name.length < GUIDE_FIELD_LIMITS.nameMin || name.length > GUIDE_FIELD_LIMITS.nameMax
		? "name_invalid"
		: undefined;
}

function ageRefusal(age: number | undefined): GuideFieldRefusal | undefined {
	if (age === undefined) return "age_missing";
	return Number.isInteger(age) &&
		age >= GUIDE_FIELD_LIMITS.ageMin &&
		age <= GUIDE_FIELD_LIMITS.ageMax
		? undefined
		: "age_invalid";
}

function detailsRefusal(raw: string | undefined): GuideFieldRefusal | undefined {
	const details = raw?.trim() ?? "";
	if (details === "") return "details_missing";
	return details.length < GUIDE_FIELD_LIMITS.detailsMin ||
		details.length > GUIDE_FIELD_LIMITS.detailsMax
		? "details_invalid"
		: undefined;
}

function phoneRefusal(raw: string | undefined): GuideFieldRefusal | undefined {
	const phone = raw?.trim() ?? "";
	if (phone === "") return "phone_missing";
	return PHONE.test(phone) ? undefined : "phone_invalid";
}

function emailRefusal(raw: string | undefined): GuideFieldRefusal | undefined {
	const email = raw?.trim() ?? "";
	if (email === "") return "email_missing";
	return email.length <= GUIDE_FIELD_LIMITS.emailMax && EMAIL.test(email)
		? undefined
		: "email_invalid";
}

export interface GuideFieldProblem {
	field: GuideField;
	reason: GuideFieldRefusal;
}

/** Every field's refusal, in the order the assistant asks for them; empty when the booking may go on. */
export function guideFieldProblems(input: GuideFieldsInput): GuideFieldProblem[] {
	const checks: ReadonlyArray<[GuideField, GuideFieldRefusal | undefined]> = [
		["name", nameRefusal(input.contact.name)],
		["age", ageRefusal(input.age)],
		["details", detailsRefusal(input.details)],
		["phone", phoneRefusal(input.contact.phone)],
		["email", emailRefusal(input.contact.email)],
	];
	return checks.flatMap(([field, reason]) => (reason === undefined ? [] : [{ field, reason }]));
}
