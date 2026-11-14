import type { Agent } from "@mastra/core/agent";
import { noopLogger } from "@mastra/core/logger";
import { Mastra } from "@mastra/core/mastra";
import { z } from "zod";
import { turnModel } from "../agent";
import type { Summariser } from "../compaction";
import { createLanguageDetector } from "../language/detect";
import { BUNDLED_LANGUAGES } from "../language/index";
import { openMemory } from "../memory";
import { sweepByRetention } from "../memory-retention";
import { type ChatModel, openRouterModel, type ProviderSort, readOpenRouterKey } from "../model";
import { createMemoryRateLimiter, type RateLimiter } from "../screening/rate-limit";
import { redactIdentifiers } from "../screening/redact-text";
import { createStaffAgent, STAFF_AGENT_ID } from "./agent";
import { modelsOfKey } from "./assistant-config";
import { buildBriefing } from "./briefing";
import { createChat, type StaffTranscript } from "./chat";
import { staffCopy } from "./copy";
import type { StaffCard, StaffEvent, StaffPage, StaffScreen } from "./events";
import { type ConfirmOutcome, confirmProposal, dismissProposal, unconfirmed } from "./execute";
import { openStaffMemory, STAFF_MEMORY_DAYS } from "./memory-store";
import type { StaffLocale } from "./model";
import { openSession, type SessionDeps } from "./open";
import type { RouteLike } from "./parity/routes";
import type { IssuesPort, StaffPort } from "./port";
import { createMemoryProposalStore, type ProposalStore } from "./proposals";
import { createReadCache, personOf } from "./read-cache";
import type { StaffLinks } from "./session";
import { agentSummariser } from "./summariser";
import type { TurnTimeouts } from "./turn";

/** The staff engine was set up wrongly: raised at startup, never during a turn. */
export class StaffConfigurationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "StaffConfigurationError";
	}
}

export interface StaffEngineOptions {
	model: {
		id: string;
		apiKey?: string;
		baseURL?: string;
		dataCollection?: "deny" | "allow";
		sort?: ProviderSort;
	};
	/**
	 * Durable conversation memory for staff, on its OWN LibSQL store (`staff:<sub>` resources):
	 * every message is sealed (AES-256-GCM, a key per person derived from `root`) and deleted its
	 * organisation's `memory.retentionDays` after it was written (`days`, 30, for a conversation no
	 * organisation stamped), by a sweep at start and every few hours. Without it the memory lives
	 * in this process only (swept the same way) and is gone on restart. `visitorUrl`, when the app
	 * also runs a visitor memory, must differ from `url`.
	 */
	memory?: { url: string; root: Buffer; visitorUrl?: string; days?: number };
	/** The clinic's time zone, for "today" and "tomorrow". Defaults to Europe/Bucharest. */
	timeZone?: string;
	proposals?: ProposalStore;
	/** Counts turns per person; defaults to 30 a minute in memory. */
	rateLimiter?: RateLimiter;
	links?: StaffLinks;
	/**
	 * The scheduling service's route table (`ROUTES` of `@psi/scheduling-sdk/contract`): each route the
	 * signed-in person may use becomes a tool, made fresh every turn. None without it.
	 */
	routes?: ReadonlyArray<RouteLike>;
	/** Visitor-facing site trouble, from the estate's log store; the `siteIssues` tool exists only with it. */
	issues?: IssuesPort;
	timeouts?: Partial<TurnTimeouts>;
	now?: () => number;
	/**
	 * Called when a stage fails: the stage and the error's text, never a message or a record. The text has e-mail
	 * addresses, phone numbers and personal numbers replaced by marks unless the turn's organisation switched
	 * `logging.redactPii` off (and the platform does not force it).
	 */
	onFailure?: (failure: { stage: string; error: string }) => void;
	/**
	 * The app's transcript log: called once per finished turn with its question and what the person finally read, and
	 * only for an organisation with `logging.keepTranscripts` on (redacted as `onFailure` is). Off: no message text
	 * ever reaches the app's log.
	 */
	onTranscript?: (transcript: StaffTranscript) => void;
	/**
	 * Writes the summary a long conversation's older part is folded into (`memory.compactAfter`); by default one call
	 * to the organisation's `model.summary` through OpenRouter.
	 */
	summariser?: Summariser;
}

const DEFAULT_TIMEOUTS: TurnTimeouts = { idleMs: 25_000, totalMs: 90_000 };
const DEFAULT_ZONE = "Europe/Bucharest";
const SWEEP_EVERY_MS = 6 * 60 * 60 * 1000;
const TurnLimit = { limit: 30, windowMs: 60_000 } as const;

const OptionsSchema = z.object({ timeZone: z.string().min(1).optional() }).passthrough();

export interface StaffEngine {
	/** Staff-only Mastra instance: the staff agent and nothing else. Never the visitors'. */
	readonly mastra: Mastra;
	readonly agent: Agent;
	readonly hasApiKey: boolean;
	/** Streams one turn for the person behind `port`. Never throws; refusals arrive as events. */
	chat(
		port: StaffPort,
		input: unknown,
		control?: { signal?: AbortSignal },
	): AsyncIterable<StaffEvent>;
	/** Executes a confirmed proposal for the person behind `port`. The only way a write happens. */
	confirm(
		port: StaffPort | undefined,
		proposalId: string,
		fallback?: StaffLocale,
	): Promise<ConfirmOutcome>;
	dismiss(port: StaffPort | undefined, proposalId: string): Promise<boolean>;
	/** The day at a glance, built without a model; undefined when nobody is signed in. */
	briefing(port: StaffPort | undefined): Promise<StaffCard | undefined>;
	/** Suggestions per screen, in the person's language. */
	suggestions(screen: StaffScreen, locale: StaffLocale): ReadonlyArray<string>;
	/** Deletes conversation older than its retention now (it also runs by itself); how many rows went. */
	sweepMemory(): Promise<number>;
}

function same(a: string, b: string): boolean {
	return a.trim() === b.trim();
}

export function createStaffEngine(options: StaffEngineOptions): StaffEngine {
	OptionsSchema.parse(options);
	if (
		options.memory?.visitorUrl !== undefined &&
		same(options.memory.url, options.memory.visitorUrl)
	) {
		throw new StaffConfigurationError("the staff memory must not be the visitor memory");
	}
	const apiKey = options.model.apiKey ?? readOpenRouterKey(process.env);
	/** One model per primary-and-fallbacks key (what an organisation's settings choose), made once. */
	const models = new Map<string, ChatModel>();
	const modelFor = (key: string): ChatModel => {
		const held = models.get(key);
		if (held !== undefined) return held;
		const { primary, fallbacks } = modelsOfKey(key);
		const built = openRouterModel({
			apiKey: apiKey ?? "",
			modelId: primary,
			fallbacks,
			usage: true,
			...(options.model.baseURL === undefined ? {} : { baseURL: options.model.baseURL }),
			dataCollection: options.model.dataCollection ?? "deny",
			sort: options.model.sort ?? "latency",
		});
		models.set(key, built);
		return built;
	};
	const model = turnModel(modelFor, options.model.id);
	const durable =
		options.memory === undefined
			? undefined
			: openStaffMemory({
					url: options.memory.url,
					root: options.memory.root,
					...(options.memory.days === undefined ? {} : { days: options.memory.days }),
				});
	const memory = durable?.memory ?? openMemory("file::memory:", "staff-memory");
	const agent = createStaffAgent({ model, memory });
	const mastra = new Mastra({
		agents: { [STAFF_AGENT_ID]: agent },
		logger: noopLogger,
	});
	const proposals = options.proposals ?? createMemoryProposalStore();
	const limiter = options.rateLimiter ?? createMemoryRateLimiter(TurnLimit);
	const timeouts: TurnTimeouts = { ...DEFAULT_TIMEOUTS, ...options.timeouts };
	const timeZone = options.timeZone ?? DEFAULT_ZONE;
	const now = options.now ?? Date.now;
	const detector = createLanguageDetector(BUNDLED_LANGUAGES);
	const reads = createReadCache(now);
	/** Redacted unless the turn's organisation said otherwise: outside a turn (the sweep, the configuration) always. */
	const fail = (stage: string, error: unknown, redact = true): void => {
		try {
			const text =
				error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 300) : "unknown error";
			options.onFailure?.({ stage, error: redact ? redactIdentifiers(text) : text });
		} catch {
			// A failing log hook must not change the answer.
		}
	};

	const sweepMemory = async (): Promise<number> => {
		try {
			return durable === undefined
				? await sweepByRetention(memory, options.memory?.days ?? STAFF_MEMORY_DAYS, Date.now())
				: await durable.sweep();
		} catch (error) {
			fail("memory-sweep", error);
			return 0;
		}
	};
	if (durable !== undefined) void sweepMemory();
	setInterval(() => void sweepMemory(), SWEEP_EVERY_MS).unref();

	const deps: SessionDeps = {
		timeZone,
		now,
		proposals,
		links: options.links,
		routes: options.routes ?? [],
		issues: options.issues,
		reads,
	};
	const open = (port: StaffPort, input: { page?: StaffPage; threadId?: string }) =>
		openSession(port, deps, input);

	const chat = createChat({
		agent,
		memory,
		detector,
		limiter,
		timeouts,
		hasApiKey: apiKey !== undefined,
		now,
		summarise: options.summariser ?? agentSummariser(modelFor),
		open,
		fail,
		...(options.onTranscript === undefined ? {} : { onTranscript: options.onTranscript }),
	});

	return {
		mastra,
		agent,
		hasApiKey: apiKey !== undefined,
		chat,
		async confirm(port, proposalId, fallback = "ro") {
			const session = port === undefined ? undefined : await open(port, {});
			if (session === undefined)
				return unconfirmed(staffCopy(fallback), proposalId, "no_principal");
			const outcome = await confirmProposal(session, proposalId);
			// A change (or an attempt) by this person: what they read before may no longer be so.
			reads.forget(personOf(session.principal.sub, session.principal.appId));
			return outcome;
		},
		async dismiss(port, proposalId) {
			const session = port === undefined ? undefined : await open(port, {});
			return session === undefined ? false : dismissProposal(session, proposalId);
		},
		async briefing(port) {
			const session = port === undefined ? undefined : await open(port, {});
			return session === undefined ? undefined : buildBriefing(session);
		},
		suggestions: (screen, locale) => staffCopy(locale).suggestions[screen],
		sweepMemory,
	};
}
