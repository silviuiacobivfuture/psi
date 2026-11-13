/**
 * The only personal data the scheduling store holds: a name and one way to call back. The rules
 * match the booking form's, so a request the form accepts is never refused here, and a crafted
 * one cannot store more.
 */
export interface Contact {
	name: string;
	email?: string;
	phone?: string;
	/** Whole years, 0 to 120. */
	age?: number;
	/** What is going on, in the person's words: personal data, erased with the contact. */
	details?: string;
}

export const CONTACT_LIMITS = {
	nameMin: 2,
	nameMax: 100,
	emailMax: 120,
	ageMax: 120,
	detailsMin: 10,
	detailsMax: 2000,
} as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9 ()-]{9,20}$/;

/** The first problem with a contact, or undefined when it may be stored. */
export function contactProblem(contact: Contact): string | undefined {
	const name = contact.name.trim();
	if (name.length < CONTACT_LIMITS.nameMin || name.length > CONTACT_LIMITS.nameMax) return "name";
	const email = contact.email?.trim() ?? "";
	const phone = contact.phone?.trim() ?? "";
	if (email === "" && phone === "") return "contact";
	if (email !== "" && (email.length > CONTACT_LIMITS.emailMax || !EMAIL.test(email))) {
		return "email";
	}
	if (phone !== "" && !PHONE.test(phone)) return "phone";
	const age = contact.age;
	if (age !== undefined && (!Number.isInteger(age) || age < 0 || age > CONTACT_LIMITS.ageMax)) {
		return "age";
	}
	const details = contact.details?.trim();
	if (
		details !== undefined &&
		(details.length < CONTACT_LIMITS.detailsMin || details.length > CONTACT_LIMITS.detailsMax)
	) {
		return "details";
	}
	return undefined;
}

/** The contact trimmed, with empty fields dropped. */
export function cleanContact(contact: Contact): Contact {
	const email = contact.email?.trim() ?? "";
	const phone = contact.phone?.trim() ?? "";
	return {
		name: contact.name.trim(),
		...(email === "" ? {} : { email }),
		...(phone === "" ? {} : { phone }),
		...(contact.age === undefined ? {} : { age: contact.age }),
		...(contact.details === undefined ? {} : { details: contact.details.trim() }),
	};
}
