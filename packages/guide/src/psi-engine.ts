import {
	createEngine,
	type Engine,
	type EngineFailure,
	type EngineOptions,
	type EngineScore,
	type EngineTimeouts,
	type RateLimiter,
} from "@psi/engine";
import { BRANDS, type Brand, type Knowledge } from "./contract";
import { engineKnowledge, knowledgeVectors } from "./knowledge";
import { DEFAULT_MODEL, readGuideEnv } from "./model";
import { PSI_PROFILES } from "./profiles";

/** The id prefix of psi's agents, memory and threads (`psi-guide-psizone`). */
export const PSI_ID_PREFIX = "psi-guide";
/** The faithfulness scorer's id, as `onScore` reports it. */
export const PSI_SCORER = "psi-faithfulness";

export interface PsiEngineOptions {
	knowledge: Knowledge;
	/** The brands to serve; all four by default. */
	brands?: ReadonlyArray<Brand>;
	/** OpenRouter key; defaults to `OPENROUTER_API_KEY`. Without one every answer is `unavailable`. */
	apiKey?: string;
	/** OpenRouter model slug; defaults to `PSI_GUIDE_MODEL`, then `DEFAULT_MODEL`. */
	model?: string;
	/** OpenRouter API base URL; for a proxy. */
	baseURL?: string;
	/** OpenRouter model slug for the guardrails; defaults to the answering model. */
	screeningModel?: string;
	/** Mastra's model guardrails; on by default. */
	modelScreening?: boolean;
	memory?: { url: string };
	timeouts?: Partial<EngineTimeouts>;
	rateLimiter?: RateLimiter;
	onFailure?: (failure: EngineFailure) => void;
	onScore?: (score: EngineScore) => void;
	/** Mastra's own settings (Studio's port, storage, observability, a logger). */
	mastra?: Pick<EngineOptions, "server" | "storage" | "observability" | "logger">;
}

/**
 * psi's guides on the engine: one profile per brand, the knowledge base's vector store registered
 * with Mastra (`mastra.getVector("chroma")`), the key and model read once from the options or the
 * environment (`OPENROUTER_API_KEY`, `PSI_GUIDE_MODEL`).
 */
export function createPsiEngine(options: PsiEngineOptions): Engine {
	const env = readGuideEnv(process.env);
	const apiKey = options.apiKey ?? env.apiKey;
	return createEngine({
		profiles: (options.brands ?? BRANDS).map((brand) => PSI_PROFILES[brand]),
		knowledge: engineKnowledge(options.knowledge),
		vectors: knowledgeVectors(options.knowledge),
		model: {
			id: options.model ?? env.model ?? DEFAULT_MODEL,
			...(apiKey === undefined ? {} : { apiKey }),
			...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
			...(options.screeningModel === undefined ? {} : { screeningId: options.screeningModel }),
		},
		screening: {
			...(options.modelScreening === undefined ? {} : { model: options.modelScreening }),
			...(options.rateLimiter === undefined ? {} : { rateLimiter: options.rateLimiter }),
		},
		...(options.memory === undefined ? {} : { memory: options.memory }),
		...(options.timeouts === undefined ? {} : { timeouts: options.timeouts }),
		...(options.onFailure === undefined ? {} : { onFailure: options.onFailure }),
		...(options.onScore === undefined ? {} : { onScore: options.onScore }),
		...options.mastra,
		idPrefix: PSI_ID_PREFIX,
		scorerId: PSI_SCORER,
	});
}
