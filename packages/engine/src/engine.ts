import type { Agent } from "@mastra/core/agent";
import { type IMastraLogger, noopLogger } from "@mastra/core/logger";
import { Mastra } from "@mastra/core/mastra";
import type { ObservabilityEntrypoint } from "@mastra/core/observability";
import type { ServerConfig } from "@mastra/core/server";
import type { MastraCompositeStore } from "@mastra/core/storage";
import type { MastraVector } from "@mastra/core/vector";
import { createProfileAgent } from "./agent";
import { runAsk } from "./ask";
import {
	type AskContext,
	type AskControl,
	ConfigurationError,
	DEFAULT_TIMEOUTS,
	type EngineFailure,
	type EngineTimeouts,
	type ThreadAgent,
} from "./ask-context";
import type { EngineKnowledge } from "./contract";
import { EngineOptionsSchema } from "./engine-options";
import { type AskInput, askInputSchema, type EngineEvent } from "./events";
import { createProfileTools } from "./grounding/agent-tools";
import { createFaithfulness, type EngineScore } from "./grounding/faithfulness";
import { createIngestWorkflow, type EngineIngest } from "./ingest-workflow";
import { createLanguageDetector } from "./language/detect";
import { BUNDLED_LANGUAGES } from "./language/index";
import type { LanguagePack } from "./language/pack";
import { openMemory } from "./memory";
import { openRouterModel, readOpenRouterKey } from "./model";
import type { Profile } from "./profile";
import { instructionsFor } from "./prompt";
import { createSchedulingAgent, type ProfileSchedulingAgent } from "./scheduling/agent";
import type { ProfileScheduling, SchedulingPort } from "./scheduling/port";
import { createSchedulingRegistryTools } from "./scheduling/tools";
import type { RateLimiter } from "./screening/rate-limit";
import { createMemoryRateLimiter } from "./screening/rate-limit";
import { createSettingsSource, type SettingsProvider } from "./settings";
import { createKnowledgeTool } from "./studio-tool";
import { createGroundedAnswerWorkflow } from "./workflow";

/** The answering model, on OpenRouter. */
export interface EngineModelOptions {
	/** The OpenRouter model slug that writes the answers. */
	id: string;
	/** OpenRouter key; defaults to `OPENROUTER_API_KEY`. Without one every answer is `unavailable`. */
	apiKey?: string;
	/** OpenRouter API base URL; for a proxy. Defaults to `https://openrouter.ai/api/v1`. */
	baseURL?: string;
	/** The slug for the model guardrails; defaults to `id`. */
	screeningId?: string;
	/**
	 * OpenRouter's `provider.data_collection` for the answering and the guardrail models; `deny`
	 * by default. `allow` is for `:free` models in development with dummy data only.
	 */
	dataCollection?: "deny" | "allow";
}

export interface EngineScreeningOptions {
	/**
	 * Mastra's model guardrails (`PromptInjectionDetector`, `ModerationProcessor`): two small model
	 * calls per answered question. On by default.
	 */
	model?: boolean;
	/** Counts questions per `AskControl.clientId`; defaults to an in-memory limiter (10 a minute). */
	rateLimiter?: RateLimiter;
	/**
	 * Counts exchanges per `AskControl.visitorKeys`, with the settings' `exchangeLimit` and
	 * `exchangeWindowHours` (default 20 a day). Defaults to an in-memory store (one process); pass
	 * a shared one (any `RateLimiter` honouring the per-call policy) for several instances.
	 */
	exchangeLimiter?: RateLimiter;
}

export interface EngineOptions {
	/** The personas the engine answers as; one Mastra agent each. */
	profiles: ReadonlyArray<Profile>;
	knowledge: EngineKnowledge;
	/**
	 * The admin's runtime settings (`RetrievalSettings`), read once per answer and parsed; on
	 * failure the last good ones, then the defaults. Without it, the defaults.
	 */
	settings?: SettingsProvider;
	/** The knowledge base's ingest; registers the `ingest-knowledge` workflow (`ingestKnowledge`). */
	ingest?: EngineIngest;
	/** Vector stores to register with Mastra (`mastra.getVector(name)`), e.g. `{ chroma }`. */
	vectors?: Readonly<Record<string, MastraVector>>;
	model: EngineModelOptions;
	screening?: EngineScreeningOptions;
	/** Conversation memory on LibSQL (e.g. `file:.data/memory.db`), used only for asks with a threadId. */
	memory?: { url: string };
	/** Mastra observability (`@mastra/observability`); off unless given. */
	observability?: ObservabilityEntrypoint;
	/** Mastra storage (workflow runs, traces); Studio wants one. */
	storage?: MastraCompositeStore;
	/**
	 * Mastra's logger. Defaults to a silent one: Mastra logs failed requests with their bodies,
	 * which carry visitors' questions.
	 */
	logger?: IMastraLogger;
	/** Mastra's HTTP server settings, for `mastra dev` (Studio) and `mastra build`. */
	server?: ServerConfig;
	/** Language packs beyond the bundled ones (`ro`, `en`); a pack for an existing locale replaces it. */
	languages?: ReadonlyArray<LanguagePack>;
	timeouts?: Partial<EngineTimeouts>;
	/** Prefixes agent, memory and resource ids; defaults to `engine`. */
	idPrefix?: string;
	/** The faithfulness scorer's id; defaults to `faithfulness`. */
	scorerId?: string;
	/** Called when a stage fails (the answer becomes `unavailable`); carries no visitor content. */
	onFailure?: (failure: EngineFailure) => void;
	/** Called with the faithfulness score of every answer that was scored; no visitor content. */
	onScore?: (score: EngineScore) => void;
	/**
	 * The scheduling store (`@psi/scheduling`'s client fits). Profiles with `scheduling` get a
	 * separate scheduling agent and Mastra registers the scheduling tools; without it, none exist.
	 */
	scheduling?: SchedulingPort;
}

/** One profile's answers. */
export interface ProfileGuide {
	readonly profile: Profile;
	/** The profile's Mastra agent (registered whether or not there is a key). */
	readonly agent: Agent;
	/** Streams one answer. Never throws: failures arrive as `refusal` events. */
	ask(input: AskInput, control?: AskControl): AsyncIterable<EngineEvent>;
	/** The profile's scheduling agent and tools, when it opted in and a store was given. */
	readonly scheduling?: ProfileSchedulingAgent;
}

export interface Engine {
	/** The one Mastra instance: the profiles' agents, the vectors, the scorer, tool and workflow. */
	readonly mastra: Mastra;
	/** The answering model's slug. */
	readonly model: string;
	/** True when an OpenRouter key is configured. */
	readonly hasApiKey: boolean;
	readonly profiles: ReadonlyArray<string>;
	/** The answers of one profile; throws for an unknown id (a setup error). */
	guide(profileId: string): ProfileGuide;
}

/** The packs each locale resolves to: the bundled ones, replaced or extended by the options. */
function languageTable(extra: ReadonlyArray<LanguagePack>): ReadonlyMap<string, LanguagePack> {
	const table = new Map<string, LanguagePack>();
	for (const pack of [...BUNDLED_LANGUAGES, ...extra]) table.set(pack.locale, pack);
	return table;
}

function profilePacks(
	profile: Profile,
	table: ReadonlyMap<string, LanguagePack>,
): ReadonlyMap<string, LanguagePack> {
	const packs = new Map<string, LanguagePack>();
	for (const locale of Object.keys(profile.locales)) {
		const pack = table.get(locale);
		if (pack === undefined) {
			throw new ConfigurationError(
				`profile ${profile.id}: no language pack for ${locale}; pass one in createEngine({ languages })`,
			);
		}
		packs.set(locale, pack);
	}
	return packs;
}

function nonEmpty<T>(items: ReadonlyArray<T>, what: string): readonly [T, ...T[]] {
	const [first, ...rest] = items;
	if (first === undefined) throw new ConfigurationError(`${what} is empty`);
	return [first, ...rest];
}

/**
 * Creates the engine: one Mastra instance with an agent per profile, the vector stores, the
 * faithfulness scorer, a knowledge tool and the grounded-answer workflow. Options are validated
 * here, so a misconfiguration fails at startup; after that nothing throws to the caller. The API
 * key comes from the options or `OPENROUTER_API_KEY`, read once, here.
 */
export function createEngine(options: EngineOptions): Engine {
	const opts = EngineOptionsSchema.parse(options);
	const ids = opts.profiles.map((profile) => profile.id);
	if (new Set(ids).size !== ids.length) throw new ConfigurationError("profile ids must be unique");
	const prefix = opts.idPrefix ?? "engine";
	const table = languageTable(opts.languages ?? []);
	const apiKey = opts.model.apiKey ?? readOpenRouterKey(process.env);
	const routing = {
		...(opts.model.baseURL === undefined ? {} : { baseURL: opts.model.baseURL }),
		dataCollection: opts.model.dataCollection ?? "deny",
	};
	// Without a key the agents are still built, so Mastra and Studio can list them; asks refuse.
	const model = openRouterModel({ apiKey: apiKey ?? "", modelId: opts.model.id, ...routing });
	const screeningId = opts.model.screeningId ?? opts.model.id;
	const screeningModel =
		apiKey === undefined || opts.screening?.model === false
			? undefined
			: (onError: (error: Error) => void) =>
					openRouterModel({ apiKey, modelId: screeningId, ...routing, onError });
	const rateLimiter = opts.screening?.rateLimiter ?? createMemoryRateLimiter();
	const exchangeLimiter = opts.screening?.exchangeLimiter ?? createMemoryRateLimiter();
	const timeouts: EngineTimeouts = { ...DEFAULT_TIMEOUTS, ...opts.timeouts };
	const allPacks = [...new Set(opts.profiles.flatMap((p) => [...profilePacks(p, table).values()]))];
	const faithfulness = createFaithfulness({
		scorerId: opts.scorerId ?? "faithfulness",
		packs: allPacks,
		nextSteps: opts.profiles.flatMap((profile) => profile.nextStepPhrases ?? []),
		knownNames: opts.profiles.map((profile) => profile.name),
	});
	const memoryUrl = opts.memory?.url;
	let memory: ReturnType<typeof openMemory> | undefined;

	const guides = new Map<string, ProfileGuide>();
	for (const profile of opts.profiles) {
		const packs = profilePacks(profile, table);
		const locales = nonEmpty([...packs.keys()], `profile ${profile.id} locales`);
		const defaultLocale = locales[0];
		const firstPack = packs.get(defaultLocale);
		const firstLocale = profile.locales[defaultLocale];
		if (firstPack === undefined || firstLocale === undefined) {
			throw new ConfigurationError(`profile ${profile.id} has no locale`);
		}
		const agentOptions = {
			id: `${prefix}-${profile.id}`,
			name: profile.name,
			instructions: instructionsFor(firstPack, firstLocale),
			model,
			tools: createProfileTools({
				profile,
				knowledge: opts.knowledge,
				defaultLocale,
				languageName: (locale) => packs.get(locale)?.name ?? locale,
				retrievalMs: timeouts.retrievalMs,
			}),
		};
		const agent = createProfileAgent(agentOptions);
		let threads: ThreadAgent | undefined;
		const threadAgent =
			apiKey === undefined || memoryUrl === undefined
				? undefined
				: (): ThreadAgent => {
						if (threads === undefined) {
							memory ??= openMemory(memoryUrl, `${prefix}-memory`);
							threads = {
								agent: createProfileAgent({
									...agentOptions,
									id: `${agentOptions.id}-threads`,
									memory,
								}),
								memory,
							};
						}
						return threads;
					};
		const ctx: AskContext = {
			profile,
			packs,
			inputSchema: askInputSchema(locales),
			languages: createLanguageDetector([...packs.values()]),
			screening: {
				injection: [...packs.values()].flatMap((pack) => pack.injection),
				abuse: [...packs.values()].flatMap((pack) => pack.abuse),
				abuseExemptions: profile.abuseExemptions ?? [],
				pii: [...packs.values()].flatMap((pack) => pack.pii),
				runnerName: `${prefix}-screening`,
			},
			faithfulness,
			knowledge: opts.knowledge,
			timeouts,
			rateLimiter,
			exchangeLimiter,
			settings: createSettingsSource({
				...(opts.settings === undefined ? {} : { provider: opts.settings }),
				timeoutMs: timeouts.screeningMs,
				onError: (error) => {
					try {
						opts.onFailure?.({
							profile: profile.id,
							stage: "settings",
							error:
								error instanceof Error
									? `${error.name}: ${error.message}`.slice(0, 300)
									: "unknown error",
						});
					} catch {
						// A failing log hook must not change the answer.
					}
				},
			}),
			onFailure: opts.onFailure,
			onScore: opts.onScore,
			screeningModel,
			agent: apiKey === undefined ? undefined : agent,
			threadAgent,
			resourceId: `${prefix}-${profile.id}`,
			...(opts.scheduling === undefined || profile.scheduling === undefined
				? {}
				: { booking: { port: opts.scheduling, scope: profile.scheduling } }),
		};
		const scheduling =
			opts.scheduling === undefined || profile.scheduling === undefined
				? undefined
				: createSchedulingAgent({
						id: `${agentOptions.id}-scheduling`,
						profile,
						scope: profile.scheduling,
						pack: firstPack,
						locale: firstLocale,
						port: opts.scheduling,
						model,
					});
		guides.set(profile.id, {
			profile,
			agent,
			ask: (input, control) => runAsk(ctx, input, control),
			...(scheduling === undefined ? {} : { scheduling }),
		});
	}

	const guide = (profileId: string): ProfileGuide => {
		const found = guides.get(profileId);
		if (found === undefined) throw new ConfigurationError(`unknown profile ${profileId}`);
		return found;
	};
	const profileIds = nonEmpty(ids, "profiles");
	const agents: Record<string, Agent> = {};
	const schedulingScopes: Record<string, ProfileScheduling> = {};
	for (const [id, entry] of guides) {
		agents[id] = entry.agent;
		if (entry.scheduling === undefined) continue;
		agents[`${id}-scheduling`] = entry.scheduling.agent;
		schedulingScopes[id] = entry.scheduling.scope;
	}
	const schedulingTools =
		opts.scheduling === undefined || Object.keys(schedulingScopes).length === 0
			? {}
			: createSchedulingRegistryTools(opts.scheduling, schedulingScopes);
	const mastra = new Mastra({
		agents,
		...(opts.vectors === undefined ? {} : { vectors: { ...opts.vectors } }),
		scorers: { [faithfulness.scorer.id]: faithfulness.scorer },
		tools: {
			searchKnowledge: createKnowledgeTool(opts.profiles, opts.knowledge),
			...schedulingTools,
		},
		workflows: {
			groundedAnswer: createGroundedAnswerWorkflow(profileIds, (id, input) => guide(id).ask(input)),
			...(opts.ingest === undefined ? {} : { ingestKnowledge: createIngestWorkflow(opts.ingest) }),
		},
		logger: opts.logger ?? noopLogger,
		...(opts.storage === undefined ? {} : { storage: opts.storage }),
		...(opts.observability === undefined ? {} : { observability: opts.observability }),
		...(opts.server === undefined ? {} : { server: opts.server }),
	});
	return {
		mastra,
		model: opts.model.id,
		hasApiKey: apiKey !== undefined,
		profiles: ids,
		guide,
	};
}
