import {
	createEngine,
	type Engine,
	type EngineArticles,
	type EngineFailure,
	type EngineOptions,
	type EngineScore,
	type EngineTimeouts,
	type EngineTiming,
	type EngineTranscript,
	type RateLimiter,
	type SchedulingPort,
	type SettingsProvider,
	type VisitorAssistantPort,
} from "@psi/engine";
import type { KnowledgeStore } from "@psi/knowledge";
import { psiArticles } from "./articles";
import { engineCatalog } from "./catalog";
import { BRANDS, type Brand, type Knowledge } from "./contract";
import { knowledgeIngest } from "./ingest";
import { engineKnowledge, knowledgeVectors } from "./knowledge";
import { DEFAULT_MODEL, readGuideEnv } from "./model";
import { PSI_PROFILES, schedulesInChat } from "./profiles";
import { psiRetrieval } from "./retrieval";
import { psiServices } from "./services/services";
import { settingsFromEnv } from "./settings";

/** The id prefix of psi's agents, memory and threads (`psi-guide-psizone`). */
export const PSI_ID_PREFIX = "psi-guide";
/** The faithfulness scorer's id, as `onScore` reports it. */
export const PSI_SCORER = "psi-faithfulness";

export interface PsiEngineOptions {
	/**
	 * What the guides search. A `@psi/knowledge` store (`createKnowledge`) also registers its
	 * vector store and the `ingest-knowledge` workflow with Mastra.
	 */
	knowledge: Knowledge | KnowledgeStore;
	/** The brands to serve; all four by default. */
	brands?: ReadonlyArray<Brand>;
	/** OpenRouter key; defaults to `OPENROUTER_API_KEY`. Without one every answer is `unavailable`. */
	apiKey?: string;
	/** OpenRouter model slug; defaults to `PSI_GUIDE_MODEL`, then `DEFAULT_MODEL`. */
	model?: string;
	/** OpenRouter API base URL; for a proxy. */
	baseURL?: string;
	/** OpenRouter model slug for the guardrails; defaults to `PSI_SCREENING_MODEL`, then the answering model. */
	screeningModel?: string;
	/** Mastra's model guardrails; defaults to on unless `PSI_MODEL_SCREENING=off` (development only). */
	modelScreening?: boolean;
	memory?: { url: string };
	timeouts?: Partial<EngineTimeouts>;
	rateLimiter?: RateLimiter;
	/** Counts exchanges per visitor key (`AskControl.visitorKeys`); in memory by default. */
	exchangeLimiter?: RateLimiter;
	/**
	 * The admin's runtime settings (the CMS's `ai-settings`, adapted to `RetrievalSettings`);
	 * defaults to `PSI_GUIDE_SETTINGS` (development), else none: the defaults.
	 */
	settings?: SettingsProvider;
	onFailure?: (failure: EngineFailure) => void;
	onScore?: (score: EngineScore) => void;
	/** Where each turn's time went (counts and milliseconds only), for the app's debug log. */
	onTiming?: (timing: EngineTiming) => void;
	/** Mastra's own settings (Studio's port, storage, observability, a logger). */
	mastra?: Pick<EngineOptions, "server" | "storage" | "observability" | "logger">;
	/**
	 * The scheduling store (`schedulingFromEnv`). The brands that schedule (Psizone's evaluations)
	 * get a scheduling agent and Mastra registers the scheduling tools.
	 */
	scheduling?: SchedulingPort;
	/**
	 * The organisation's visitor assistant settings and meters (`schedulingFromEnv(...).scheduling.assistant`). The
	 * brands with a scheduling tenant (Psizone, Hemi-Sync) are then governed by them: the store's limits, budget and model take
	 * precedence over the CMS's `ai-settings`, which keep the content (see `@psi/engine`'s `visitor-governance.ts`).
	 */
	visitorAssistant?: VisitorAssistantPort;
	/** Each finished turn's question and answer, only when the organisation keeps transcripts (redacted as it says). */
	onTranscript?: (transcript: EngineTranscript) => void;
	/**
	 * The blog's articles the guides may list and recommend (`findArticles`), each guide only its
	 * brands' (`ARTICLE_POLICY`); defaults to the repository's catalogue under the blog's own
	 * visibility policy.
	 */
	articles?: EngineArticles;
}

/**
 * psi's guides on the engine: one profile per brand, the knowledge base's vector store and its
 * `ingest-knowledge` workflow registered with Mastra (`mastra.getVector("chroma")`), the key,
 * models and switches read once from the options or the environment (`OPENROUTER_API_KEY`,
 * `PSI_GUIDE_MODEL`, `PSI_SCREENING_MODEL`, `PSI_MODEL_SCREENING`,
 * `PSI_OPENROUTER_DATA_COLLECTION`, `PSI_DEMO_KNOWLEDGE`; see `readGuideEnv`). A development-only
 * switch set in production throws here, at startup.
 */
export function createPsiEngine(options: PsiEngineOptions): Engine {
	const env = readGuideEnv(process.env);
	const apiKey = options.apiKey ?? env.apiKey;
	const screeningId = options.screeningModel ?? env.screeningModel;
	const settings = options.settings ?? settingsFromEnv(process.env);
	const store = "ingest" in options.knowledge ? options.knowledge : undefined;
	const retrieval =
		store === undefined
			? undefined
			: psiRetrieval(store, {
					demo: env.demo,
					apiKey,
					dataCollection: env.dataCollection,
					onDegraded: (d) => {
						try {
							options.onFailure?.({ profile: d.brand, stage: d.stage, error: d.error });
						} catch {
							// A failing log hook must not change the answer.
						}
					},
					onSyncFailed: (brand, error) => {
						try {
							options.onFailure?.({ profile: brand, stage: "retrieval", error });
						} catch {
							// A failing log hook must not change the answer.
						}
					},
				});
	const catalog =
		retrieval === undefined
			? undefined
			: engineCatalog(retrieval.catalog, { demo: env.demo, sync: retrieval.sync });
	return createEngine({
		profiles: (options.brands ?? BRANDS).map((brand) => PSI_PROFILES[brand]),
		knowledge: engineKnowledge(options.knowledge, {
			demo: env.demo,
			...(retrieval === undefined || catalog === undefined
				? {}
				: { tiered: retrieval.tiered, ready: retrieval.ready, catalog }),
		}),
		articles: options.articles ?? psiArticles(),
		services: psiServices({
			...(catalog === undefined ? {} : { catalog }),
			// A brand books in its chat when it schedules and the store is reachable.
			bookingInChat: (brand) => options.scheduling !== undefined && schedulesInChat(brand),
		}),
		vectors: knowledgeVectors(options.knowledge),
		...(store === undefined
			? {}
			: {
					ingest: knowledgeIngest(store, {
						demo: env.demo,
						...(retrieval === undefined ? {} : { catalog: retrieval.catalog }),
					}),
				}),
		model: {
			id: options.model ?? env.model ?? DEFAULT_MODEL,
			...(apiKey === undefined ? {} : { apiKey }),
			...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
			...(screeningId === undefined ? {} : { screeningId }),
			dataCollection: env.dataCollection,
			sort: env.sort,
		},
		screening: {
			model: options.modelScreening ?? env.modelScreening,
			...(options.rateLimiter === undefined ? {} : { rateLimiter: options.rateLimiter }),
			...(options.exchangeLimiter === undefined
				? {}
				: { exchangeLimiter: options.exchangeLimiter }),
		},
		...(settings === undefined ? {} : { settings }),
		...(options.memory === undefined ? {} : { memory: options.memory }),
		...(options.timeouts === undefined ? {} : { timeouts: options.timeouts }),
		...(options.onFailure === undefined ? {} : { onFailure: options.onFailure }),
		...(options.onScore === undefined ? {} : { onScore: options.onScore }),
		...(options.onTiming === undefined ? {} : { onTiming: options.onTiming }),
		...(options.scheduling === undefined ? {} : { scheduling: options.scheduling }),
		...(options.visitorAssistant === undefined
			? {}
			: { visitorAssistant: options.visitorAssistant }),
		...(options.onTranscript === undefined ? {} : { onTranscript: options.onTranscript }),
		...options.mastra,
		idPrefix: PSI_ID_PREFIX,
		scorerId: PSI_SCORER,
	});
}
