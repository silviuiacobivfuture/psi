import { type ConversationStyle, DEFAULT_STYLE } from "@psi/engine";
import type { Brand, Locale } from "../contract";

type Style = ConversationStyle;

/** How the reply addresses the person and how it sounds (rule 7 of the prompt). */
const HOUSE_STYLE: Readonly<Record<Locale, (s: Style) => string>> = {
	ro: (s) => {
		const person =
			s.formality === "formal"
				? "la persoana a doua plural de politețe („dumneavoastră”)"
				: "la persoana a doua singular";
		const tone = {
			high: "cald și direct",
			medium: "prietenos și direct",
			low: "politicos și direct",
		}[s.warmth];
		return `Scrii în română, cu diacritice corecte (ă â î ș ț), ${person}, ${tone}. Fără emoji, fără semne de exclamare. Majusculă doar la începutul propoziției.`;
	},
	en: (s) => {
		const tone = {
			high: "warm and direct",
			medium: "friendly and direct",
			low: "courteous and direct",
		}[s.warmth];
		return `Write in English, second person singular, ${tone}. No emoji, no exclamation marks. Sentence case.`;
	},
};

/** How long a reply may be (rule 8 of the prompt). */
const LENGTH: Readonly<Record<Locale, Readonly<Record<Style["length"], string>>>> = {
	ro: {
		short:
			"Răspunsul e foarte scurt: în conversație una-două propoziții; la o întrebare despre fapte cel mult un paragraf scurt, fără titluri, fără liste.",
		medium:
			"Răspunsul e scurt: în conversație una-trei propoziții; la o întrebare despre fapte cel mult trei paragrafe scurte, fără titluri, fără liste lungi.",
		long: "Răspunsul poate fi mai amplu: în conversație două-patru propoziții; la o întrebare despre fapte cel mult cinci paragrafe scurte, fără titluri, fără liste lungi.",
	},
	en: {
		short:
			"Keep it very short: one or two sentences in conversation; for a factual question at most one short paragraph, no headings, no lists.",
		medium:
			"Keep it short: one to three sentences in conversation; for a factual question at most three short paragraphs, no headings, no long lists.",
		long: "It may be fuller: two to four sentences in conversation; for a factual question at most five short paragraphs, no headings, no long lists.",
	},
};

/** psi's safety rules, whatever the style: no diagnosis or medication, no promises. */
const SAFETY: Readonly<Record<Locale, readonly [string, string]>> = {
	ro: [
		"Nu pui diagnostice, nu vorbești despre medicamente și nu dai sfaturi de tratament pentru o persoană anume; recomanzi, în română, o evaluare cu un specialist.",
		"Nu promiți vindecări, rezultate sau termene. Cifrele le copiezi exact cum apar în pasaje; nu dai procente sau cifre care nu apar acolo.",
	],
	en: [
		"Never diagnose, never discuss medication, never give treatment advice for a specific person; recommend, in English, an evaluation with a specialist.",
		"Never promise cures, outcomes or timelines. Copy figures exactly as the passages give them; never give percentages or figures that are not in the passages.",
	],
};

/**
 * psi's own rules, numbered by the engine between its grounding rules and its closing rules (so
 * they read as rules 5 to 8): no diagnosis or medication, no promises (both fixed), the house
 * style and the length (both in the owner's style; the default is as they were written).
 */
export function policyOf(locale: Locale, style: Style = DEFAULT_STYLE): ReadonlyArray<string> {
	return [...SAFETY[locale], HOUSE_STYLE[locale](style), LENGTH[locale][style.length]];
}

/** The rules a style can never change: they are in every guide's prompt. */
export const SAFETY_RULES: Readonly<Record<Locale, ReadonlyArray<string>>> = SAFETY;

/** The next steps a short sentence may offer without a citation, as the prompt names them. */
export const NEXT_STEPS: Readonly<Record<Locale, string>> = {
	ro: "o programare, un articol, un hub",
	en: "booking, an article, a hub",
};

/** EQ-SYNC's headphones line, a next step the brand voices ask for (folded). */
export const NEXT_STEP_PHRASES: ReadonlyArray<string> = [
	"foloseste casti",
	"folositi casti",
	"use headphones",
];

/**
 * What a brand's follow-up question may be about (rarely, and never the same twice): only what
 * the brand really offers. EQ-SYNC is a self-guided audio programme: no meeting, no session with
 * a person.
 */
export const FOLLOW_UP_TOPICS: Readonly<Record<Brand, Readonly<Record<Locale, string>>>> = {
	psizone: {
		ro: "Dacă pui o întrebare de continuare, e despre evaluare, prima discuție la telefon sau programare.",
		en: "If you ask a follow-up question, it is about the evaluation, the first phone call or booking.",
	},
	eqsync: {
		ro: "EQ-SYNC e un program audio pe care îl asculți singur, cu căști: nu există întâlniri sau ședințe cu cineva. Dacă pui o întrebare de continuare, e despre prima zi, exerciții, căști sau protocoalele de după.",
		en: "EQ-SYNC is a self-guided audio programme you listen to alone, with headphones: there are no meetings or sessions with anyone. If you ask a follow-up question, it is about day 1, the exercises, headphones or the protocols after.",
	},
	hemisync: {
		ro: "Dacă pui o întrebare de continuare, e despre programe, ateliere sau exercițiile gratuite.",
		en: "If you ask a follow-up question, it is about the programmes, the workshops or the free exercises.",
	},
	blog: {
		ro: "Dacă pui o întrebare de continuare, e despre articole: o temă, un articol anume sau cum le revizuim.",
		en: "If you ask a follow-up question, it is about the articles: a topic, one article or how we review them.",
	},
};
