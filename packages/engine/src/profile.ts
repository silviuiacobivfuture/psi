import { z } from "zod";
import type { ConversationStyle } from "./behaviour";
import { LocaleCodeSchema } from "./contract";
import { type RefusalReason, RefusalReasonSchema } from "./events";
import { type RuleSet, RuleSetsSchema } from "./rules";
import { type ProfileScheduling, ProfileSchedulingSchema } from "./scheduling/port";

/** See `ProfileLocale.handoff`. */
export interface ProfileHandoff {
	line: string;
	label: string;
	href: (question: string) => string;
}

/** What a profile says in one locale: its voice, its policy rules and its allowed next steps. */
export interface ProfileLocale {
	/** Who the persona is and how it speaks, in this locale (from the brand book, say). */
	voice: string;
	/**
	 * The profile's own numbered rules, between the engine's grounding rules and its closing
	 * rules: what the persona never does (diagnose, promise outcomes), its style, its length.
	 */
	policy: ReadonlyArray<string>;
	/** The next steps a short uncited sentence may offer, as the prompt names them. */
	nextSteps: string;
	/**
	 * The guide's own short, warm reply to small talk ("hi", "what can you do?"): who it is and
	 * what it can help with. Only a FALLBACK: sent as written when the model is unreachable (no
	 * key, a provider failure) or still answers in another language after its retry; the model
	 * replies to small talk otherwise.
	 */
	welcome?: string;
	/** The fallback reply to a thank-you ("mulțumesc", "thanks a lot"); the welcome otherwise. */
	thanks?: string;
	/** The fallback mid-conversation (after an answered turn): no greeting. The welcome otherwise. */
	followUp?: string;
	/**
	 * The honest line when a reply stated only facts nothing supports, even after its retry: "I
	 * don't have that on our site; our team can tell you". Sent with the profile's contact.
	 */
	unknown?: string;
	/**
	 * Facts the profile's owner states (a phone number, the opening hours), which a reply may
	 * carry without a tool result.
	 */
	facts?: ReadonlyArray<string>;
	/**
	 * Where a booking request goes when this site cannot book itself (it has no scheduling store):
	 * `line` is the guide's warm reply, `label` the button, `href` the address that opens the
	 * sister site's chat with the booking started (given the visitor's message, so it can carry the
	 * service they named). The reply is sent without asking the model.
	 */
	handoff?: ProfileHandoff;
	/**
	 * The voice and policy rewritten for the owner's conversation style (warmth, length, address,
	 * follow-ups), when the profile's own text states any of these. Called only for a style other
	 * than `DEFAULT_STYLE`, which `voice` and `policy` are written in. Without it the profile's
	 * text stays as written and only the pack's rules follow the style.
	 */
	restyle?: (style: ConversationStyle) => { voice: string; policy: ReadonlyArray<string> };
}

/**
 * A rule about what an answer may name. When the question matches `when`, an answer that matches
 * `forbid` is stopped mid-stream and refused as `refusal`: a clinic's guide naming a sister brand
 * on a clinical question, say.
 */
export interface CrossReferenceRule {
	when: ReadonlyArray<RuleSet>;
	forbid: ReadonlyArray<RuleSet>;
	refusal: RefusalReason;
}

/** The model guardrails' instructions for this persona's context (the engine has neutral ones). */
export interface ScreeningPrompts {
	/** `PromptInjectionDetector` instructions. Must mention "prompt injection". */
	injection?: string;
	/** `ModerationProcessor` instructions. */
	moderation?: string;
	/** The moderation categories judged; defaults to harassment, hate, sexual-explicit, threat. */
	moderationCategories?: ReadonlyArray<string>;
}

/** How the persona refuses what it cannot take. */
export interface RefusalPolicy {
	/** What an empty, over-long or malformed question is refused as. Defaults to `out_of_scope`. */
	invalidInput?: RefusalReason;
	/** How many characters of an over-long question are still scanned for crisis. Defaults to 8000. */
	crisisScanLimit?: number;
}

/**
 * A persona the engine answers as, entirely as data. Rule sets match folded text (see `fold`).
 * The engine registers one Mastra agent per profile; a consumer brings as many as it has.
 */
export interface Profile {
	/** `[a-z0-9-]`, unique in one engine: names the agent, its memory resource and its threads. */
	id: string;
	/** The agent's display name. */
	name: string;
	/** What `EngineKnowledge.search` receives as `scope`. */
	knowledgeScope: string;
	/** The locales it answers in, each with its voice; every one needs a language pack. */
	locales: Readonly<Record<string, ProfileLocale>>;
	/** Refused as `crisis` before anything else, the rate limit included; never sent to a model. */
	crisis?: ReadonlyArray<RuleSet>;
	/** Refused as `out_of_scope` before retrieval. */
	outOfScope?: ReadonlyArray<RuleSet>;
	/** A question matching these is never refused as `abuse` by the rules (a tic, a bullied child). */
	abuseExemptions?: ReadonlyArray<RuleSet>;
	crossReferences?: ReadonlyArray<CrossReferenceRule>;
	/** Next-step phrases (folded) a short sentence may carry uncited, beyond the language packs'. */
	nextStepPhrases?: ReadonlyArray<string>;
	screening?: ScreeningPrompts;
	refusalPolicy?: RefusalPolicy;
	/**
	 * Opts the profile into scheduling: a separate agent with the scheduling tools, for this
	 * tenant's services (needs `createEngine({ scheduling })`). The grounded answers never see it.
	 */
	scheduling?: ProfileScheduling;
}

const ProfileLocaleSchema: z.ZodType<ProfileLocale> = z
	.object({
		voice: z.string().trim().min(1),
		policy: z.array(z.string().trim().min(1)).readonly(),
		nextSteps: z.string().trim().min(1),
		welcome: z.string().trim().min(1).max(600).optional(),
		thanks: z.string().trim().min(1).max(300).optional(),
		followUp: z.string().trim().min(1).max(600).optional(),
		unknown: z.string().trim().min(1).max(600).optional(),
		facts: z.array(z.string().trim().min(1).max(600)).readonly().optional(),
		handoff: z
			.object({
				line: z.string().trim().min(1).max(600),
				label: z.string().trim().min(1).max(60),
				href: z.custom<ProfileHandoff["href"]>((value) => typeof value === "function"),
			})
			.strict()
			.optional(),
		restyle: z
			.custom<NonNullable<ProfileLocale["restyle"]>>((value) => typeof value === "function")
			.optional(),
	})
	.strict();

const CrossReferenceRuleSchema: z.ZodType<CrossReferenceRule> = z
	.object({ when: RuleSetsSchema, forbid: RuleSetsSchema, refusal: RefusalReasonSchema })
	.strict();

export const ProfileSchema: z.ZodType<Profile> = z
	.object({
		id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
		name: z.string().trim().min(1),
		knowledgeScope: z.string().trim().min(1),
		locales: z
			.record(LocaleCodeSchema, ProfileLocaleSchema)
			.refine((locales) => Object.keys(locales).length > 0, "a profile needs a locale"),
		crisis: RuleSetsSchema.optional(),
		outOfScope: RuleSetsSchema.optional(),
		abuseExemptions: RuleSetsSchema.optional(),
		crossReferences: z.array(CrossReferenceRuleSchema).readonly().optional(),
		nextStepPhrases: z.array(z.string().min(1)).readonly().optional(),
		screening: z
			.object({
				injection: z.string().includes("prompt injection").optional(),
				moderation: z.string().min(1).optional(),
				moderationCategories: z.array(z.string().min(1)).min(1).readonly().optional(),
			})
			.strict()
			.optional(),
		refusalPolicy: z
			.object({
				invalidInput: RefusalReasonSchema.optional(),
				crisisScanLimit: z.number().int().positive().optional(),
			})
			.strict()
			.optional(),
		scheduling: ProfileSchedulingSchema.optional(),
	})
	.strict();

/** The default for `RefusalPolicy.crisisScanLimit`. */
export const CRISIS_SCAN_LIMIT = 8000;
