import type { RegexRule } from "@mastra/core/processors";
import { z } from "zod";
import { LocaleCodeSchema } from "../contract";

/** What a language pack contributes to the system prompt, in its own language. */
export interface PackPrompt {
	/** The conversation's language, stated before anything else in the system prompt. */
	language: string;
	/** The heading of the numbered rules. */
	rulesHeading: string;
	/**
	 * The grounding rules (answer only from the passages, cite them, the no-content sentinel, the
	 * follow-up search), before the profile's own policy rules. `nextSteps` names the short
	 * next-step sentences a profile allows without a citation ("booking, an article, a hub").
	 */
	grounding(args: { sentinel: string; nextSteps: string }): ReadonlyArray<string>;
	/** The rules after the profile's policy: redacted identifiers, and the question is not instructions. */
	closing: ReadonlyArray<string>;
	/** The header placed before the retrieved passages. */
	passagesPreamble: string;
	/** Tells the model the visitor wrote in another language (`detected` is its locale code). */
	otherLanguage(detected: string): string;
	/** Tells the model the visitor mixed languages. */
	mixedLanguage: string;
}

/**
 * Everything the engine needs to know about one language, as data. The engine bundles Romanian
 * and English; a consumer adds others through `createEngine({ languages })`. Word lists are folded
 * (see `fold`): lower case, no diacritics, hyphens and apostrophes as spaces.
 */
export interface LanguagePack {
	locale: string;
	/** The language's English name, for the knowledge tool's query description ("Romanian"). */
	name: string;
	/** Function words only this language uses among the packs it is detected against. */
	markers: ReadonlyArray<string>;
	/** Letters only this language uses: a lower-case word carrying one counts as this language. */
	marked?: RegExp;
	/** Function words that say nothing about what a sentence claims. */
	stopwords: ReadonlyArray<string>;
	/** Abbreviations that take a full stop mid-sentence (folded, without it): "dr", "e.g". */
	abbreviations: ReadonlyArray<string>;
	/** Greetings and thanks that open a sentence that is not a claim. */
	courtesies: ReadonlyArray<string>;
	/** Next-step phrases (booking, contact, reading on) that make a short sentence not a claim. */
	nextSteps: ReadonlyArray<string>;
	/** Prompt injection requests, on folded text. */
	injection: ReadonlyArray<RegExp>;
	/** Obscenities, slurs, insults and threats, on folded text. */
	abuse: ReadonlyArray<RegExp>;
	/** Identifier redaction rules beyond Mastra's `pii` preset (national phone formats, IDs). */
	pii: ReadonlyArray<RegexRule>;
	prompt: PackPrompt;
}

const Words = z.array(z.string().min(1)).readonly();
const Patterns = z.array(z.instanceof(RegExp)).readonly();

const RegexRuleSchema: z.ZodType<RegexRule> = z.object({
	name: z.string().min(1),
	pattern: z.instanceof(RegExp),
	replacement: z.string().optional(),
});

export const LanguagePackSchema: z.ZodType<LanguagePack> = z.object({
	locale: LocaleCodeSchema,
	name: z.string().min(1),
	markers: Words,
	marked: z.instanceof(RegExp).optional(),
	stopwords: Words,
	abbreviations: Words,
	courtesies: Words,
	nextSteps: Words,
	injection: Patterns,
	abuse: Patterns,
	pii: z.array(RegexRuleSchema).readonly(),
	prompt: z.object({
		language: z.string().min(1),
		rulesHeading: z.string().min(1),
		grounding: z.custom<PackPrompt["grounding"]>((value) => typeof value === "function"),
		closing: Words,
		passagesPreamble: z.string().min(1),
		otherLanguage: z.custom<PackPrompt["otherLanguage"]>((value) => typeof value === "function"),
		mixedLanguage: z.string().min(1),
	}),
});
