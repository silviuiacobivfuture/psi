import { z } from "zod/v4";

/**
 * What every booking a visitor submits must carry, checked by the service before anything is written: the five fields
 * the sites ask, in their form and in their assistant alike (name, age, what is going on, phone AND e-mail). The bounds
 * are the scheduling store's own (`CONTACT_LIMITS` in @psi/scheduling; a test in the service fails if they part).
 *
 * One refusal reason per field and per way it can be wrong (`detail.reason` of a 400 `invalid`, with `detail.field`
 * and every refused field in `detail.fields`).
 */
export const BOOKING_REQUIRED_FIELDS = ["name", "age", "details", "phone", "email"] as const;
export type BookingField = (typeof BOOKING_REQUIRED_FIELDS)[number];

export const BOOKING_FIELD_REFUSALS = [
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
export const BookingFieldRefusal = z.enum(BOOKING_FIELD_REFUSALS);
export type BookingFieldRefusal = z.infer<typeof BookingFieldRefusal>;

export const BOOKING_FIELD_LIMITS = {
	nameMin: 2,
	nameMax: 100,
	ageMin: 0,
	ageMax: 120,
	detailsMin: 10,
	detailsMax: 2000,
	emailMax: 120,
} as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9 ()-]{9,20}$/;

export interface BookingFieldsInput {
	contact: {
		name: string;
		email?: string | undefined;
		phone?: string | undefined;
		age?: number | undefined;
		details?: string | undefined;
	};
}

function nameRefusal(raw: string): BookingFieldRefusal | undefined {
	const name = raw.trim();
	if (name === "") return "name_missing";
	return name.length < BOOKING_FIELD_LIMITS.nameMin || name.length > BOOKING_FIELD_LIMITS.nameMax
		? "name_invalid"
		: undefined;
}

function ageRefusal(age: number | undefined): BookingFieldRefusal | undefined {
	if (age === undefined) return "age_missing";
	return Number.isInteger(age) &&
		age >= BOOKING_FIELD_LIMITS.ageMin &&
		age <= BOOKING_FIELD_LIMITS.ageMax
		? undefined
		: "age_invalid";
}

function detailsRefusal(raw: string | undefined): BookingFieldRefusal | undefined {
	const details = raw?.trim() ?? "";
	if (details === "") return "details_missing";
	return details.length < BOOKING_FIELD_LIMITS.detailsMin ||
		details.length > BOOKING_FIELD_LIMITS.detailsMax
		? "details_invalid"
		: undefined;
}

function phoneRefusal(raw: string | undefined): BookingFieldRefusal | undefined {
	const phone = raw?.trim() ?? "";
	if (phone === "") return "phone_missing";
	return PHONE.test(phone) ? undefined : "phone_invalid";
}

function emailRefusal(raw: string | undefined): BookingFieldRefusal | undefined {
	const email = raw?.trim() ?? "";
	if (email === "") return "email_missing";
	return email.length <= BOOKING_FIELD_LIMITS.emailMax && EMAIL.test(email)
		? undefined
		: "email_invalid";
}

export interface BookingFieldProblem {
	field: BookingField;
	reason: BookingFieldRefusal;
}

/** Every field's refusal, in the order the sites ask for them; empty when the booking may go on. */
export function bookingFieldProblems(input: BookingFieldsInput): BookingFieldProblem[] {
	const c = input.contact;
	const checks: ReadonlyArray<[BookingField, BookingFieldRefusal | undefined]> = [
		["name", nameRefusal(c.name)],
		["age", ageRefusal(c.age)],
		["details", detailsRefusal(c.details)],
		["phone", phoneRefusal(c.phone)],
		["email", emailRefusal(c.email)],
	];
	return checks.flatMap(([field, reason]) => (reason === undefined ? [] : [{ field, reason }]));
}
