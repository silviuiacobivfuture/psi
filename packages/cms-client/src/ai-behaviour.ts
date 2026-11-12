import { z } from "zod";

/**
 * How a brand's guide behaves, as the CMS's "Comportamentul AI" studio sets it: the voice, the
 * copy a visitor sees, the topics, the model and its creativity. Version 1. Every field has a
 * default that is today's built-in behaviour, and every field is read leniently: a value a site
 * does not know (a newer CMS, a model it does not offer) falls back to that field's default, never
 * to "no settings at all". The safety rules (crisis, scope, claims, PII, injection) are not here
 * and cannot be: they are the guide's own and always on.
 */
export const BEHAVIOUR_VERSION = 1;

export const WARMTH = ["low", "medium", "high"] as const;
export const LENGTHS = ["short", "medium", "long"] as const;
/** Romanian's T-V distinction: `informal` is „tu”, `formal` is „dumneavoastră”. */
export const FORMALITY = ["informal", "formal"] as const;
export const FOLLOW_UPS = ["never", "sometimes", "often"] as const;
/** The answering model's temperature, in three steps: 0.2, 0.5 (today), 0.8. */
export const CREATIVITY = ["precise", "balanced", "creative"] as const;
/** The way to the team the guide suggests first. */
export const CONTACT_ROUTES = ["phone", "contact", "booking"] as const;
export const COPY_LOCALES = ["ro", "en"] as const;

/**
 * The answering models a brand may choose (OpenRouter slugs with tool calling, checked against
 * https://openrouter.ai/api/v1/models and run through the studio's five test prompts on
 * 2026-11-12: every one answered in Romanian within seconds; `xiaomi/mimo-v2.6-pro` was left out,
 * at 12–58 s a reply and one timeout). The first is the default (owner, 2026-11-11). A site runs
 * its configured model (`PSI_GUIDE_MODEL`) when none is chosen.
 */
export const GUIDE_MODELS = [
	"xiaomi/mimo-v2.6-flash",
	"google/gemini-3.1-flash-lite",
	"anthropic/claude-haiku-5.5",
] as const;

/**
 * Models that answer at their own fixed temperature: Mastra sends them none, so the creativity
 * setting does not change them (the studio says so).
 */
export const GuideModelSchema = z.enum(GUIDE_MODELS);
export type GuideModel = z.infer<typeof GuideModelSchema>;
export const FIXED_TEMPERATURE_MODELS: ReadonlyArray<GuideModel> = ["anthropic/claude-haiku-5.5"];

export const EXTRA_INSTRUCTIONS_MAX = 1500;
export const COPY_LINE_MAX = 600;
export const CHIP_MAX = 120;
export const CHIPS = 3;
export const TOPIC_MAX = 60;
export const TOPICS_MAX = 12;

export const ConversationStyle = z.object({
	warmth: z.enum(WARMTH),
	length: z.enum(LENGTHS),
	formality: z.enum(FORMALITY),
	followUps: z.enum(FOLLOW_UPS),
});
export type ConversationStyle = z.infer<typeof ConversationStyle>;

const Line = (max: number) => z.string().trim().min(1).max(max);

/** What a visitor reads, per locale; an absent line is the site's built-in copy. */
export const GuideCopy = z.object({
	/** The greeting at the top of the chat. */
	welcome: Line(COPY_LINE_MAX).optional(),
	/** The three example questions (quick-reply chips). */
	chips: z.array(Line(CHIP_MAX)).max(CHIPS).optional(),
	/** The redirect for a question outside what the brand does (a diagnosis, a medication). */
	outOfScope: Line(COPY_LINE_MAX).optional(),
	/** The honest line when nothing on the site supports an answer. */
	unknown: Line(COPY_LINE_MAX).optional(),
	/** The message when a visitor used up their exchanges for the window. */
	exchangeLimit: Line(COPY_LINE_MAX).optional(),
});
export type GuideCopy = z.infer<typeof GuideCopy>;
export const COPY_KEYS = ["welcome", "chips", "outOfScope", "unknown", "exchangeLimit"] as const;
export type CopyKey = (typeof COPY_KEYS)[number];

const Topic = z.string().trim().min(1).max(TOPIC_MAX);

export const AiBehaviour = z.object({
	version: z.literal(BEHAVIOUR_VERSION),
	style: ConversationStyle,
	/** Appended to the brand's built-in rules in a delimited, lower-priority section. */
	extraInstructions: z.string().max(EXTRA_INSTRUCTIONS_MAX),
	copy: z.object({ ro: GuideCopy, en: GuideCopy }),
	focusTopics: z.array(Topic).max(TOPICS_MAX),
	avoidTopics: z.array(Topic).max(TOPICS_MAX),
	/** Null: the brand's own next steps (today). */
	contactRoute: z.enum(CONTACT_ROUTES).nullable(),
	/** Null: the site's configured model. */
	model: GuideModelSchema.nullable(),
	creativity: z.enum(CREATIVITY),
});
export type AiBehaviour = z.infer<typeof AiBehaviour>;

/** Today's behaviour: warm and close, "tu", medium length, follow-ups sometimes. */
export const BEHAVIOUR_DEFAULTS: AiBehaviour = {
	version: BEHAVIOUR_VERSION,
	style: { warmth: "high", length: "medium", formality: "informal", followUps: "sometimes" },
	extraInstructions: "",
	copy: { ro: {}, en: {} },
	focusTopics: [],
	avoidTopics: [],
	contactRoute: null,
	model: null,
	creativity: "balanced",
};

/** The studio's three tone presets: each sets the four voice controls at once. */
export const TONE_PRESETS = {
	warm: { warmth: "high", length: "medium", formality: "informal", followUps: "sometimes" },
	calm: { warmth: "medium", length: "medium", formality: "formal", followUps: "never" },
	concise: { warmth: "low", length: "short", formality: "informal", followUps: "never" },
} as const satisfies Record<string, ConversationStyle>;
export type TonePreset = keyof typeof TONE_PRESETS;

/** The preset these controls amount to, or null when they are a mix of the owner's own. */
export function presetOf(style: ConversationStyle): TonePreset | null {
	const hit = (Object.keys(TONE_PRESETS) as TonePreset[]).find((k) => {
		const p = TONE_PRESETS[k];
		return (
			p.warmth === style.warmth &&
			p.length === style.length &&
			p.formality === style.formality &&
			p.followUps === style.followUps
		);
	});
	return hit ?? null;
}

const Obj = z.record(z.unknown());
const field = <T>(schema: z.ZodType<T>, raw: unknown, fallback: T): T => {
	const r = schema.safeParse(raw);
	return r.success ? r.data : fallback;
};

/** One locale's copy, keeping each valid line and dropping the rest (blank chips included). */
function copyFrom(raw: unknown): GuideCopy {
	const o = Obj.safeParse(raw);
	if (!o.success) return {};
	const out: GuideCopy = {};
	for (const k of ["welcome", "outOfScope", "unknown", "exchangeLimit"] as const) {
		const v = Line(COPY_LINE_MAX).safeParse(o.data[k]);
		if (v.success) out[k] = v.data;
	}
	const chips = z.array(z.unknown()).safeParse(o.data.chips);
	if (chips.success) {
		const kept = chips.data
			.map((c) => Line(CHIP_MAX).safeParse(c))
			.flatMap((c) => (c.success ? [c.data] : []))
			.slice(0, CHIPS);
		if (kept.length > 0) out.chips = kept;
	}
	return out;
}

function topicsFrom(raw: unknown): string[] {
	const list = z.array(z.unknown()).safeParse(raw);
	if (!list.success) return [];
	const kept = new Map<string, string>();
	for (const t of list.data) {
		const v = Topic.safeParse(t);
		if (v.success && !kept.has(v.data.toLowerCase())) kept.set(v.data.toLowerCase(), v.data);
	}
	return [...kept.values()].slice(0, TOPICS_MAX);
}

/**
 * A brand's behaviour from whatever the CMS stored or sent: each field parsed on its own, a
 * missing or unknown value is that field's default. Never throws, never null.
 */
export function behaviourFrom(raw: unknown): AiBehaviour {
	const o = Obj.safeParse(raw);
	const d = BEHAVIOUR_DEFAULTS;
	if (!o.success) return d;
	const r = o.data;
	const s = Obj.safeParse(r.style);
	const style = s.success ? s.data : {};
	const copy = Obj.safeParse(r.copy);
	const extra = typeof r.extraInstructions === "string" ? r.extraInstructions : "";
	return {
		version: BEHAVIOUR_VERSION,
		style: {
			warmth: field(z.enum(WARMTH), style.warmth, d.style.warmth),
			length: field(z.enum(LENGTHS), style.length, d.style.length),
			formality: field(z.enum(FORMALITY), style.formality, d.style.formality),
			followUps: field(z.enum(FOLLOW_UPS), style.followUps, d.style.followUps),
		},
		extraInstructions: extra.slice(0, EXTRA_INSTRUCTIONS_MAX),
		copy: {
			ro: copyFrom(copy.success ? copy.data.ro : undefined),
			en: copyFrom(copy.success ? copy.data.en : undefined),
		},
		focusTopics: topicsFrom(r.focusTopics),
		avoidTopics: topicsFrom(r.avoidTopics),
		contactRoute: field(z.enum(CONTACT_ROUTES).nullable(), r.contactRoute, d.contactRoute),
		model: field(GuideModelSchema.nullable(), r.model, d.model),
		creativity: field(z.enum(CREATIVITY), r.creativity, d.creativity),
	};
}

/**
 * The copy a site renders for one locale: only the lines the studio set, so the site keeps its
 * own built-in message for everything else (`copy.welcome ?? m.guide_intro()`).
 */
export function guideCopyFor(
	behaviour: AiBehaviour | null | undefined,
	locale: (typeof COPY_LOCALES)[number],
): GuideCopy {
	return behaviour?.copy[locale] ?? {};
}

/** The built-in copy a site answers the studio with, per locale, shown as placeholders there. */
export const CopyDefaults = z.object({
	welcome: z.string(),
	chips: z.array(z.string()).max(CHIPS),
	outOfScope: z.string(),
	unknown: z.string(),
	exchangeLimit: z.string(),
});
export type CopyDefaults = z.infer<typeof CopyDefaults>;

/** The studio's copy over a site's built-in copy: each line the studio set, else the site's. */
export function copyWithDefaults(copy: GuideCopy, defaults: CopyDefaults): CopyDefaults {
	return {
		welcome: copy.welcome ?? defaults.welcome,
		chips: copy.chips ?? defaults.chips,
		outOfScope: copy.outOfScope ?? defaults.outOfScope,
		unknown: copy.unknown ?? defaults.unknown,
		exchangeLimit: copy.exchangeLimit ?? defaults.exchangeLimit,
	};
}
