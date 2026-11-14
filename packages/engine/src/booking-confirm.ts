import type { BookingLang } from "./booking-state";
import { fold } from "./text/normalize";

/**
 * What a visitor may type to answer the summary card, read on whole messages only: the exact
 * words of a yes ("da", "confirm", "trimite", "e ok", "yes") or of a wish to edit. Anything else,
 * thanks, "ok", "poate", a question, is neither: only an explicit yes is consent to submit.
 */

const YES: Readonly<Record<BookingLang, ReadonlySet<string>>> = {
	ro: new Set([
		"da",
		"da confirm",
		"da trimite",
		"da te rog",
		"da vreau",
		"confirm",
		"confirma",
		"confirm programarea",
		"confirma programarea",
		"confirm cererea",
		"trimite",
		"trimite cererea",
		"trimite programarea",
		"e ok",
		"este ok",
		"e ok trimite",
		"e bine",
	]),
	en: new Set([
		"yes",
		"yes confirm",
		"yes please",
		"yes send it",
		"yes book it",
		"yep",
		"confirm",
		"confirm it",
		"confirm booking",
		"confirm the booking",
		"book it",
		"send it",
	]),
};

const EDIT: ReadonlySet<string> = new Set([
	"editeaza",
	"editeaza datele",
	"modifica",
	"modific",
	"schimba",
	"corecteaza",
	"vreau sa modific",
	"vreau sa schimb",
	"edit",
	"edit details",
	"change",
	"change details",
	"i want to change something",
]);

/** The message with only its words left, folded: punctuation and emoji are not words. */
function words(text: string): string {
	return fold(text)
		.replace(/[^\p{L}\p{N} ]/gu, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * An explicit yes: `{}` when the words are the same in both languages ("confirm"), else the
 * language they are in. Undefined when the message is not a yes.
 */
export function confirmation(text: string): { lang?: BookingLang } | undefined {
	const said = words(text);
	const ro = YES.ro.has(said);
	const en = YES.en.has(said);
	if (ro && en) return {};
	if (ro) return { lang: "ro" };
	return en ? { lang: "en" } : undefined;
}

/** True when the message asks to edit the details by hand. */
export function wantsEdit(text: string): boolean {
	return EDIT.has(words(text));
}
