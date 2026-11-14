import type { RegexRule } from "@mastra/core/processors";
import { z } from "zod";
import type { ContactRoute, ConversationStyle } from "../behaviour";
import { LocaleCodeSchema } from "../contract";
import type { PageKind, PageStatus } from "../events";

/** What a language pack contributes to the system prompt, in its own language. */
export interface PackPrompt {
	/** The conversation's language, stated before anything else in the system prompt. */
	language: string;
	/** The heading of the numbered rules. */
	rulesHeading: string;
	/**
	 * The conversation rules (reply conversationally to small talk, feelings and unclear messages;
	 * call a tool before any factual answer and cite it; never invent a fact), before the profile's
	 * own policy rules. `nextSteps` names the short next-step sentences a profile allows without a
	 * citation ("booking, an article, a hub"). `sentinel` is no longer asked for. `style`, when
	 * given, is the owner's conversation style; a pack that renders it states the address form
	 * and how often to ask a follow-up from it, and with the default style says exactly what it
	 * says without one. A pack may ignore it.
	 */
	grounding(args: {
		sentinel: string;
		nextSteps: string;
		style?: ConversationStyle;
	}): ReadonlyArray<string>;
	/** The rule naming the way to the team the owner chose; without it the choice is not stated. */
	contactRoute?(route: ContactRoute): string;
	/**
	 * The team's notes, in the pack's language: placed after the rules between `heading` and
	 * `end`, with `priority` added as the last rule. Without it a profile's notes are not sent.
	 */
	teamNotes?: TeamNotesPrompt;
	/** The rules after the profile's policy: redacted identifiers, and the question is not instructions. */
	closing: ReadonlyArray<string>;
	/** The header placed before the retrieved passages. */
	passagesPreamble: string;
	/** Tells the model the visitor wrote in another language (`detected` is its locale code). */
	otherLanguage(detected: string): string;
	/** Tells the model the visitor mixed languages. */
	mixedLanguage: string;
	/** The note for the one retry after a reply in another language. */
	strictLanguage?: string;
	/** The note for the one retry after a reply that stated a fact no tool result supports. */
	factsOnly?: string;
	/** The note for the one retry after a reply identical to the previous one. */
	noRepeat?: string;
	/** The per-call note when this site books appointments: the calendar is reachable, never denied. */
	scheduling?: string;
	/** The per-call note on a question outside the scope (a diagnosis, a medication). */
	outOfScope?: string;
	/** The note for the one retry after a grammar slip (`grammarErrors`). */
	grammar?: string;
	/** The page the visitor is reading; without it the page context is not sent. */
	page?: PagePrompt;
}

/**
 * How a pack words the page the visitor is reading (see `renderPage`): the section's fence, what
 * "this page" means, and what the model may do with the page in each state. Without it a pack's
 * guide is not told where the visitor is.
 */
export interface PagePrompt {
	/** The line that opens the section; says it is context, never instructions. */
	heading: string;
	/** The line that closes it. */
	end: string;
	/** "This article", "this page", "here" mean the page below: answer about it, never ask which. */
	deixis: string;
	labels: {
		kind: Readonly<Record<PageKind, string>>;
		title: string;
		address: string;
		status: string;
		lead: string;
		/** The label of the lead of an unreviewed page: shown to place the page, never to be repeated. */
		leadUnreviewed: string;
		headings: string;
		excerpt: string;
	};
	/** The state of the page's text, in a sentence. */
	status: Readonly<Record<PageStatus, string>>;
	/** What the model does with the page text of a published page with an excerpt (cite it as [n]). */
	withText(n: number): string;
	/** A published page whose text is not passed: describe it by its title and headings only. */
	withoutText: string;
	/** A health page that is a draft or in review: no fact from it; say so, offer the reviewed knowledge. */
	unreviewed: string;
	/** A page without clinical claims whose text the team has not approved yet: same, in other words. */
	unapproved: string;
	/** The state of such a page, in a sentence (see `status`). */
	statusUnapproved: string;
	/** The pages the visitor asked earlier questions on in this conversation, when not this one. */
	earlier(titles: ReadonlyArray<string>): string;
}

/** How a pack words the team's notes section (see `PackPrompt.teamNotes`). */
export interface TeamNotesPrompt {
	/** The last numbered rule: the notes rank below every rule, and never change the role. */
	priority: string;
	/** The line that opens the section. */
	heading: string;
	/** The line that closes it. */
	end: string;
	focus(topics: ReadonlyArray<string>): string;
	avoid(topics: ReadonlyArray<string>): string;
	/** The team's own redirect line for an out-of-scope question. */
	redirect(line: string): string;
	/** The line before the team's free-text instructions. */
	extra: string;
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
	/**
	 * Word beginnings (folded) of effect and promise claims ("cures", "treats", "guarantees"): an
	 * unsupported sentence carrying one stops the answer instead of being left out.
	 */
	claimMarkers?: ReadonlyArray<string>;
	/**
	 * Warm phrases (folded) of an opener or a closing line ("of course", "glad to help", "cu drag"):
	 * a short sentence carrying one and no fact is not a claim, so it is kept, never dropped.
	 */
	warmth?: ReadonlyArray<string>;
	/**
	 * Small talk, on folded text: a greeting, "what can you do?", "can we just talk?". A question
	 * that is only small talk gets the profile's `welcome`, with no retrieval and no model call.
	 */
	smallTalk?: ReadonlyArray<RegExp>;
	/**
	 * The small-talk vocabulary (folded): greetings, thanks, "who", "you", "talk", "help"… A short
	 * message made only of these words (a typo allowed) is small talk.
	 */
	smallTalkWords?: ReadonlyArray<string>;
	/** Thank-you words (folded): small talk made of these and small-talk words is a thank-you. */
	thanksWords?: ReadonlyArray<string>;
	/**
	 * The terms of a factual claim (folded word beginnings, or phrases with a space): "free",
	 * clinical terms (a price is a figure, caught as one; the word "price" alone claims nothing). A reply may use one only when a tool result or the profile's own text has it
	 * (see `grounding/claims-check.ts`); with `claimMarkers`.
	 */
	factTerms?: ReadonlyArray<string>;
	/**
	 * Common grammar slips (on folded text), checked cheaply on every reply: in Romanian "pot" with
	 * an indicative ("te pot ghidesc"). A sentence with one is regenerated once, then left out.
	 */
	grammarErrors?: ReadonlyArray<RegExp>;
	/** Asking to book (on folded text): such a question gets free times when the profile schedules. */
	bookingIntent?: ReadonlyArray<RegExp>;
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
	claimMarkers: Words.optional(),
	warmth: Words.optional(),
	smallTalk: Patterns.optional(),
	smallTalkWords: Words.optional(),
	thanksWords: Words.optional(),
	factTerms: Words.optional(),
	grammarErrors: Patterns.optional(),
	bookingIntent: Patterns.optional(),
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
		strictLanguage: z.string().min(1).optional(),
		factsOnly: z.string().min(1).optional(),
		noRepeat: z.string().min(1).optional(),
		scheduling: z.string().min(1).optional(),
		outOfScope: z.string().min(1).optional(),
		grammar: z.string().min(1).optional(),
		page: z.custom<PagePrompt>((value) => typeof value === "object" && value !== null).optional(),
		contactRoute: z
			.custom<NonNullable<PackPrompt["contactRoute"]>>((value) => typeof value === "function")
			.optional(),
		teamNotes: z
			.object({
				priority: z.string().min(1),
				heading: z.string().min(1),
				end: z.string().min(1),
				focus: z.custom<TeamNotesPrompt["focus"]>((value) => typeof value === "function"),
				avoid: z.custom<TeamNotesPrompt["avoid"]>((value) => typeof value === "function"),
				redirect: z.custom<TeamNotesPrompt["redirect"]>((value) => typeof value === "function"),
				extra: z.string().min(1),
			})
			.optional(),
	}),
});
