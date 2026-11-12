import { z } from "zod";
import { readBehaviour, type TurnBehaviour } from "./behaviour";
import { within } from "./deadline";

/**
 * The runtime settings an admin changes without a deploy (psi: the per-brand `ai-settings` global
 * in the CMS). The engine defines the shape; the app adapts its CMS response to it and hands in a
 * provider. Every field is optional in what a provider returns: a missing field keeps its default.
 */
export interface RetrievalSettings {
	/** `lexical` forces the lexical retrieval tier; `openrouter` uses embeddings when a key exists. */
	embeddings: "openrouter" | "lexical";
	/**
	 * The OpenRouter embedding model; each model has its own indexes. Unset: the knowledge
	 * store's own model (`PSI_EMBED_MODEL`), so configuration alone decides.
	 */
	embedModel?: string;
	/** Deep semantic search (query expansion, a larger topK, fusion with lexical). */
	deepSearch: boolean;
	/** False makes every answer `unavailable` (a `disabled` failure is reported). */
	guideEnabled: boolean;
	/** Exchanges (answered or refused questions) one visitor key may make per window. */
	exchangeLimit: number;
	/** The exchange window, in hours. */
	exchangeWindowHours: number;
	/**
	 * `standard` (the default): every deterministic guardrail (crisis, the rate and exchange
	 * limits, unicode, the injection and abuse rules, PII redaction, scope, the accuracy gate), no
	 * model detectors. `strict`: those plus Mastra's two model detectors, failing open. Crisis,
	 * scope, PII and the accuracy gate are not configurable.
	 */
	screeningLevel: "standard" | "strict";
	/**
	 * How the profile converses (style, the team's notes, topics, model, creativity, copy).
	 * Undefined: the profile exactly as written. Read field by field (`readBehaviour`), so an
	 * unreadable part never discards the rest of the settings.
	 */
	behaviour?: TurnBehaviour;
}

export const DEFAULT_SETTINGS: RetrievalSettings = {
	embeddings: "openrouter",
	deepSearch: false,
	guideEnabled: true,
	exchangeLimit: 20,
	exchangeWindowHours: 24,
	screeningLevel: "standard",
};

/** What a provider may return, parsed at the boundary; unknown keys are ignored. */
export const RetrievalSettingsSchema: z.ZodType<
	Partial<RetrievalSettings>,
	z.ZodTypeDef,
	unknown
> = z
	.object({
		embeddings: z.enum(["openrouter", "lexical"]),
		embedModel: z
			.string()
			.trim()
			.regex(/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i),
		deepSearch: z.boolean(),
		guideEnabled: z.boolean(),
		exchangeLimit: z.number().int().min(1).max(10_000),
		screeningLevel: z.enum(["standard", "strict"]),
		exchangeWindowHours: z
			.number()
			.min(1 / 60)
			.max(24 * 31),
		behaviour: z.unknown().transform(readBehaviour),
	})
	.partial();

/**
 * The settings for one turn: the provider's, with a per-turn override on top (the control
 * plane's preview of unsaved settings). The override is parsed like a provider's answer; when
 * part of it is unreadable, only its behaviour is taken. It is never remembered: the next turn
 * starts from the provider's again.
 */
export function settingsForTurn(base: RetrievalSettings, override: unknown): RetrievalSettings {
	if (override === undefined || override === null) return base;
	const parsed = RetrievalSettingsSchema.safeParse(override);
	if (parsed.success) return { ...base, ...parsed.data };
	const raw = z.object({ behaviour: z.unknown() }).passthrough().safeParse(override);
	return raw.success && raw.data.behaviour !== undefined
		? { ...base, behaviour: readBehaviour(raw.data.behaviour) }
		: base;
}

/** Where the settings come from: the app's provider, or none (the defaults). */
export type SettingsProvider = () => Promise<unknown>;

export interface SettingsSource {
	/** The settings for this answer: the provider's, else the last good ones, else the defaults. */
	current(): Promise<RetrievalSettings>;
}

export interface SettingsSourceOptions {
	provider?: SettingsProvider;
	/** How long one provider call may take before the last good settings are used. */
	timeoutMs: number;
	/** Told when the provider fails or answers something unreadable (never with its content). */
	onError?: (error: unknown) => void;
}

/**
 * Reads the provider once per answer (the provider caches; the engine does not), failing safe: an
 * error, a timeout or an unreadable answer keeps the last good settings, and before any good
 * answer, the defaults.
 */
export function createSettingsSource(opts: SettingsSourceOptions): SettingsSource {
	const provider = opts.provider;
	let last: RetrievalSettings = DEFAULT_SETTINGS;
	return {
		async current() {
			if (provider === undefined) return last;
			try {
				const raw = await within(
					Promise.resolve().then(provider),
					opts.timeoutMs,
					"settings provider",
				);
				last = { ...DEFAULT_SETTINGS, ...RetrievalSettingsSchema.parse(raw) };
			} catch (error) {
				opts.onError?.(error);
			}
			return last;
		},
	};
}
