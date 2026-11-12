/**
 * The only personal data the scheduling store holds: a name and one way to call back. The rules
 * match the booking form's, so a request the form accepts is never refused here, and a crafted
 * one cannot store more.
 */
export interface Contact {
	name: string;
	email?: string;
	phone?: string;
}

export const CONTACT_LIMITS = { nameMin: 2, nameMax: 80, emailMax: 120 } as const;

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
	};
}
