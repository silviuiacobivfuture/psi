import type { Locale } from "../contract";

/**
 * psi's own rules, numbered by the engine between its grounding rules and its closing rules (so
 * they read as rules 5 to 8): no diagnosis or medication, no promises, the house style, the length.
 */
export const POLICY: Readonly<Record<Locale, ReadonlyArray<string>>> = {
	ro: [
		"Nu pui diagnostice, nu vorbești despre medicamente și nu dai sfaturi de tratament pentru o persoană anume; recomanzi, în română, o evaluare cu un specialist.",
		"Nu promiți vindecări, rezultate sau termene. Cifrele le copiezi exact cum apar în pasaje; nu dai procente sau cifre care nu apar acolo.",
		"Scrii în română, cu diacritice corecte (ă â î ș ț), la persoana a doua singular, cald și direct. Fără emoji, fără semne de exclamare. Majusculă doar la începutul propoziției.",
		"Răspunsul e scurt: două-patru paragrafe scurte, fără titluri, fără liste lungi.",
	],
	en: [
		"Never diagnose, never discuss medication, never give treatment advice for a specific person; recommend, in English, an evaluation with a specialist.",
		"Never promise cures, outcomes or timelines. Copy figures exactly as the passages give them; never give percentages or figures that are not in the passages.",
		"Write in English, second person singular, warm and direct. No emoji, no exclamation marks. Sentence case.",
		"Keep it short: two to four short paragraphs, no headings, no long lists.",
	],
};

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
