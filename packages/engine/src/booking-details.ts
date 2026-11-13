import type { BookingDetails, BookingDetailsReport, ForWhom } from "./booking-state";
import { fold } from "./text/normalize";

/**
 * The details a visitor types into the chat while the booking form is up, read without a model:
 * a name, a phone (Romanian or international), an e-mail, who the appointment is for, and an
 * explicit "I agree". A piece is set only when the message says it; text that says none of them
 * sets nothing (the caller decides whether it was a question or noise). The same limits as the
 * form's own parser apply, so what is read here is what the form would accept.
 */

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/u;
/** Digits with the separators people type, at least nine of them. */
const PHONE = /(?:\+|00)?\d[\d\s().-]{7,18}\d/;
const CONSENT =
	/\b(sunt de acord|ma declar de acord|imi dau acordul|consimt|accept|i agree|i consent|i accept)\b/;
const REFUSAL = /\b(nu sunt de acord|nu accept|nu consimt|do not agree|don t agree|i do not)\b/;
const TEEN = /\b(adolescent|adolescenta|adolescenti|teen|teenager|liceu|liceean|liceeana)\b/;
const CHILD =
	/\b(copil|copilul|copila|copilului|fiul|fiica|baiat|baiatul|fata|fetita|nepotul|nepoata|child|son|daughter|kid)\b/;
const ADULT = /\b(pentru mine|for me|for myself|adult|pentru mine insumi|pentru mine insami)\b/;
const AGE = /\b(\d{1,2})\s*(?:de\s+)?(?:ani|years?|yo|y\/o)\b/;
const NAME_LEAD =
	/(?:ma numesc|numele meu (?:este|e)|numele este|sunt|eu sunt|my name is|i am|i m)\s+(.+)$/;
/** The words of the consent and who-for phrases, which are not a name either. */
const PHRASE_WORDS =
	"sunt acord declar insumi insami consimt accept agree consent adult adolescent adolescenta teen copil copilul copila fiul fiica baiat baiatul fata fetita nepotul nepoata child son daughter kid".split(
		" ",
	);
/** Words that are not part of a name: answers, thanks and the labels people write before a number. */
const FILLER = new Set([
	...PHRASE_WORDS,
	..."da nu ok okay bine mersi multumesc multumim buna salut hei hello hi pentru mine telefon telefonul numar numarul nr tel email mail adresa adresa de este e al meu mea si sau cu la on the is my phone number address for me name numele nume".split(
		" ",
	),
]);
const NAME_TOKEN = /^\p{Lu}[\p{L}'’-]+$/u;
const CONNECTOR = new Set(["de", "von", "van", "al", "el", "la", "di", "da", "du"]);
const MAX_NAME_TOKENS = 4;

function phoneOf(text: string): { phone: string; rest: string } | undefined {
	const found = PHONE.exec(text);
	if (found === null) return undefined;
	const digits = found[0].replace(/\D/g, "");
	if (digits.length < 9 || digits.length > 15) return undefined;
	const lead = found[0].trimStart();
	const international = lead.startsWith("+") || lead.startsWith("00");
	const national = international ? digits.replace(/^00/, "") : digits;
	const phone = international ? `+${national}` : national;
	return { phone, rest: text.replace(found[0], " ") };
}

function forWhomOf(folded: string): ForWhom | undefined {
	const age = AGE.exec(folded)?.[1];
	if (age !== undefined) {
		const years = Number(age);
		if (years < 13) return "child";
		return years < 18 ? "teen" : "adult";
	}
	if (TEEN.test(folded)) return "teen";
	if (CHILD.test(folded)) return "child";
	return ADULT.test(folded) ? "adult" : undefined;
}

/** A name written as one: capitalised words, nothing else (a lower-case line is not taken for one). */
const word = (t: string): string => fold(t).trim();

function nameOf(text: string): string | undefined {
	const tokens = text
		.replace(/[,;:!"“”()]+/g, " ")
		.split(/\s+/)
		.filter((t) => t !== "" && !FILLER.has(word(t)));
	if (tokens.length === 0 || tokens.length > MAX_NAME_TOKENS) return undefined;
	const named = tokens.every((t) => NAME_TOKEN.test(t) || CONNECTOR.has(word(t)));
	const first = tokens[0];
	if (!named || first === undefined || !NAME_TOKEN.test(first)) return undefined;
	const name = tokens.join(" ");
	return name.length >= 2 && name.length <= 80 ? name : undefined;
}

/** What the message tells, merged over what was known: a new piece replaces the old one. */
export function readDetails(
	typed: string,
	known: BookingDetails = {},
): { values: BookingDetails; heard: BookingDetailsReport["heard"] } {
	const values: { -readonly [K in keyof BookingDetails]: BookingDetails[K] } = { ...known };
	const heard: Array<BookingDetailsReport["heard"][number]> = [];
	let rest = typed.replace(/\s+/g, " ").trim();
	const email = EMAIL.exec(rest);
	if (email !== null) {
		values.email = email[0].toLowerCase();
		heard.push("email");
		rest = rest.replace(email[0], " ");
	}
	const phone = phoneOf(rest);
	if (phone !== undefined) {
		values.phone = phone.phone;
		heard.push("phone");
		rest = phone.rest;
	}
	const folded = fold(rest);
	if (CONSENT.test(folded) && !REFUSAL.test(folded)) {
		values.consent = true;
		heard.push("consent");
	}
	const forWhom = forWhomOf(folded);
	if (forWhom !== undefined) {
		values.forWhom = forWhom;
		heard.push("forWhom");
	}
	// A name: introduced ("my name is …"), or the message that is nothing but a name.
	const lead = NAME_LEAD.exec(fold(rest));
	const introduced = lead === null ? undefined : rest.slice(rest.length - (lead[1] ?? "").length);
	const name = (introduced === undefined ? undefined : nameOf(introduced)) ?? nameOf(rest);
	if (name !== undefined) {
		values.name = name;
		heard.push("name");
	}
	return { values, heard };
}

/** What the form still needs before the one tap. */
export function missingDetails(values: BookingDetails): BookingDetailsReport["missing"] {
	return [
		...(values.name === undefined ? (["name"] as const) : []),
		...(values.email === undefined && values.phone === undefined ? (["contact"] as const) : []),
		...(values.forWhom === undefined ? (["forWhom"] as const) : []),
		...(values.consent === undefined ? (["consent"] as const) : []),
	];
}
