import {
	type AskControl,
	type EngineTimeouts,
	type FailureStage,
	ModelIdSchema,
	type RateLimiter,
	type SchedulingPort,
	SchedulingPortSchema,
	type SettingsProvider,
} from "@psi/engine";
import { z } from "zod";
import { type Brand, BrandSchema, type Knowledge } from "./contract";
import type { AskInput, GuideEvent } from "./events";
import { createPsiEngine } from "./psi-engine";

/** Time budgets for one answer, in milliseconds (see the engine's `EngineTimeouts`). */
export type GuideTimeouts = EngineTimeouts;

/**
 * Why a stage failed, for the app's logs. It names the stage and the error, never the question,
 * the passages or the answer. Every failure makes the answer `unavailable`.
 */
export interface GuideFailure {
	stage: FailureStage;
	error: string;
}

/** The faithfulness of one answer: how many of its claims the cited passages support. */
export interface GuideScore {
	scorer: "psi-faithfulness";
	/** Supported claims over claims, 0 to 1 (0 when the answer makes no claim at all). */
	score: number;
	claims: number;
	supported: number;
	/** True when the answer may be shown: at least one claim, and every claim supported. */
	passed: boolean;
	/** Sentences left out of the answer as unsupported (they invented no fact). */
	dropped: number;
}

export interface GuideOptions {
	brand: Brand;
	knowledge: Knowledge;
	/** OpenRouter key; defaults to `OPENROUTER_API_KEY`. Without one every answer is `unavailable`. */
	apiKey?: string;
	/** OpenRouter model slug; defaults to `PSI_GUIDE_MODEL`, then `DEFAULT_MODEL`. */
	model?: string;
	/** Conversation memory on LibSQL (e.g. `file:.data/guide.db`), used only for asks with a threadId. */
	memory?: { url: string };
	/** OpenRouter API base URL; for a proxy. Defaults to `https://openrouter.ai/api/v1`. */
	baseURL?: string;
	/** Time budgets; see `GuideTimeouts`. */
	timeouts?: Partial<GuideTimeouts>;
	/** Called when a stage fails (the answer becomes `unavailable`); carries no visitor content. */
	onFailure?: (failure: GuideFailure) => void;
	/** Called with the faithfulness score of every answer that was scored; carries no visitor content. */
	onScore?: (score: GuideScore) => void;
	/**
	 * Counts questions per `AskControl.clientId`. Defaults to an in-memory limiter (10 questions a
	 * minute per client), which suits development and a single instance only.
	 */
	rateLimiter?: RateLimiter;
	/**
	 * Counts exchanges per visitor key (`AskControl.visitorKeys`: session cookie, browser cookie,
	 * fingerprint), with the settings' `exchangeLimit` per `exchangeWindowHours` (default 20 a
	 * day). In memory by default (one process); pass a shared `RateLimiter` for several instances.
	 */
	exchangeLimiter?: RateLimiter;
	/**
	 * The admin's runtime settings provider (`RetrievalSettings`: `guideEnabled`, `exchangeLimit`,
	 * `exchangeWindowHours`, the retrieval switches), cached by the caller; parsed per answer, with
	 * the last good value and then the defaults as fallbacks. Defaults to `PSI_GUIDE_SETTINGS`.
	 */
	settings?: SettingsProvider;
	/**
	 * The scheduling store's engine port (`schedulingFromEnv(...).scheduling.port`). For a brand
	 * that schedules (Psizone), a booking question is answered in the conversation with free times
	 * the app renders as its confirm step; nothing is ever held or booked by the guide.
	 */
	scheduling?: SchedulingPort;
	/**
	 * Mastra's model guardrails (`PromptInjectionDetector`, `ModerationProcessor`): two small model
	 * calls per answered question. On by default.
	 */
	modelScreening?: boolean;
	/** OpenRouter model slug for the guardrails; defaults to the answering model. */
	screeningModel?: string;
}

export interface Guide {
	readonly brand: Brand;
	/** The OpenRouter model slug in use. */
	readonly model: string;
	/** Streams one answer. Never throws: failures arrive as `refusal` events. */
	ask(input: AskInput, control?: AskControl): AsyncIterable<GuideEvent>;
}

const KnowledgeSchema: z.ZodType<Knowledge> = z.custom<Knowledge>(
	(value) =>
		typeof value === "object" &&
		value !== null &&
		"search" in value &&
		typeof value.search === "function",
	{ message: "knowledge must have a search function" },
);

const Millis = z.number().int().positive().max(600_000);

const GuideOptionsSchema = z.object({
	brand: BrandSchema,
	knowledge: KnowledgeSchema,
	apiKey: z.string().trim().min(1).optional(),
	model: ModelIdSchema.optional(),
	memory: z.object({ url: z.string().trim().min(1) }).optional(),
	baseURL: z.string().url().optional(),
	timeouts: z
		.object({ retrievalMs: Millis, screeningMs: Millis, idleMs: Millis, totalMs: Millis })
		.partial()
		.optional(),
	onFailure: z
		.custom<(failure: GuideFailure) => void>((value) => typeof value === "function")
		.optional(),
	onScore: z.custom<(score: GuideScore) => void>((value) => typeof value === "function").optional(),
	rateLimiter: z
		.custom<RateLimiter>(
			(value) =>
				typeof value === "object" &&
				value !== null &&
				"take" in value &&
				typeof value.take === "function",
			{ message: "rateLimiter must have a take function" },
		)
		.optional(),
	exchangeLimiter: z
		.custom<RateLimiter>(
			(value) =>
				typeof value === "object" &&
				value !== null &&
				"take" in value &&
				typeof value.take === "function",
			{ message: "exchangeLimiter must have a take function" },
		)
		.optional(),
	settings: z.custom<SettingsProvider>((value) => typeof value === "function").optional(),
	scheduling: SchedulingPortSchema.optional(),
	modelScreening: z.boolean().optional(),
	screeningModel: ModelIdSchema.optional(),
});

/**
 * Creates the guide for one brand: psi's profile for it, on the engine. Options are validated
 * here, so a misconfiguration fails at startup; after that nothing throws to the caller. The API
 * key and model come from the options or the environment (`OPENROUTER_API_KEY`,
 * `PSI_GUIDE_MODEL`); they are read once, here.
 */
export function createGuide(options: GuideOptions): Guide {
	const { brand, onFailure, onScore, ...rest } = GuideOptionsSchema.parse(options);
	const engine = createPsiEngine({
		...rest,
		brands: [brand],
		...(onFailure === undefined
			? {}
			: { onFailure: (failure) => onFailure({ stage: failure.stage, error: failure.error }) }),
		...(onScore === undefined
			? {}
			: {
					onScore: (score) =>
						onScore({
							scorer: "psi-faithfulness",
							score: score.score,
							claims: score.claims,
							supported: score.supported,
							passed: score.passed,
							dropped: score.dropped,
						}),
				}),
	});
	const profile = engine.guide(brand);
	return { brand, model: engine.model, ask: (input, control) => profile.ask(input, control) };
}
