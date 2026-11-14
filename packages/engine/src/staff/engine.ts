import type { Agent } from "@mastra/core/agent";
import { noopLogger } from "@mastra/core/logger";
import { Mastra } from "@mastra/core/mastra";
import { z } from "zod";
import { createLanguageDetector } from "../language/detect";
import { BUNDLED_LANGUAGES } from "../language/index";
import { openMemory } from "../memory";
import { openRouterModel, type ProviderSort, readOpenRouterKey } from "../model";
import { createMemoryRateLimiter, type RateLimiter } from "../screening/rate-limit";
import { createStaffAgent, STAFF_AGENT_ID } from "./agent";
import { buildBriefing } from "./briefing";
import { staffCopy } from "./copy";
import {
	type StaffCard,
	type StaffEvent,
	type StaffPage,
	type StaffScreen,
	StaffTurnInputSchema,
} from "./events";
import { type ConfirmOutcome, confirmProposal, dismissProposal, unconfirmed } from "./execute";
import { openStaffMemory } from "./memory-store";
import type { StaffLocale } from "./model";
import { openSession, type SessionDeps } from "./open";
import { baseKeys } from "./parity/needs";
import type { RouteLike } from "./parity/routes";
import type { IssuesPort, StaffPort } from "./port";
import { staffInstructions } from "./prompt";
import { createMemoryProposalStore, type ProposalStore } from "./proposals";
import type { StaffLinks } from "./session";
import { runTurn, type TurnTimeouts } from "./turn";

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
	 * every message is sealed (AES-256-GCM, a key per person derived from `root`) and deleted
	 * `days` (30) days after it was written, by a sweep at start and every few hours. Without it
	 * the memory lives in this process only and is gone on restart. `visitorUrl`, when the app
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
	/** Called when a stage fails: the stage and the error's text, never a message or a record. */
	onFailure?: (failure: { stage: string; error: string }) => void;
}

const DEFAULT_TIMEOUTS: TurnTimeouts = { idleMs: 25_000, totalMs: 90_000 };
const DEFAULT_ZONE = "Europe/Bucharest";
/** An identical message in the same conversation inside this window is the person pressing twice. */
const REPEAT_WINDOW_MS = 5_000;
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
	/** Deletes conversation older than the retention now (it also runs by itself); how many rows went. */
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
	const model = openRouterModel({
		apiKey: apiKey ?? "",
		modelId: options.model.id,
		...(options.model.baseURL === undefined ? {} : { baseURL: options.model.baseURL }),
		dataCollection: options.model.dataCollection ?? "deny",
		sort: options.model.sort ?? "latency",
	});
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
	const fail = (stage: string, error: unknown): void => {
		try {
			options.onFailure?.({
				stage,
				error:
					error instanceof Error
						? `${error.name}: ${error.message}`.slice(0, 300)
						: "unknown error",
			});
		} catch {
			// A failing log hook must not change the answer.
		}
	};

	/** Messages a person sent a moment ago, by conversation: the same one again within the window is a double press. */
	const recent = new Map<string, number>();
	const isRepeat = (sub: string, threadId: string | undefined, message: string): boolean => {
		const at = now();
		for (const [key, when] of recent) if (at - when > REPEAT_WINDOW_MS) recent.delete(key);
		const key = `${sub}\u0000${threadId ?? "default"}\u0000${message.trim().replace(/\s+/g, " ").toLowerCase()}`;
		if (recent.has(key)) return true;
		recent.set(key, at);
		return false;
	};

	const sweepMemory = async (): Promise<number> => {
		if (durable === undefined) return 0;
		try {
			return await durable.sweep();
		} catch (error) {
			fail("memory-sweep", error);
			return 0;
		}
	};
	if (durable !== undefined) {
		void sweepMemory();
		setInterval(() => void sweepMemory(), SWEEP_EVERY_MS).unref();
	}

	const deps: SessionDeps = {
		timeZone,
		now,
		proposals,
		links: options.links,
		routes: options.routes ?? [],
		issues: options.issues,
	};
	const open = (port: StaffPort, input: { page?: StaffPage; threadId?: string }) =>
		openSession(port, deps, input);

	async function* chat(
		port: StaffPort,
		raw: unknown,
		control?: { signal?: AbortSignal },
	): AsyncGenerator<StaffEvent, void, undefined> {
		const parsed = StaffTurnInputSchema.safeParse(raw);
		if (!parsed.success) {
			yield { type: "refusal", reason: "invalid" };
			yield { type: "done" };
			return;
		}
		const session = await open(port, {
			page: parsed.data.page,
			threadId: parsed.data.threadId,
		});
		if (session === undefined) {
			yield { type: "refusal", reason: "no_principal" };
			yield { type: "done" };
			return;
		}
		const caps = await session.port.capabilities();
		session.caps = caps.ok ? baseKeys(caps.value.permissions) : undefined;
		if (!(await limiter.take(`staff:${session.principal.sub}`))) {
			yield { type: "refusal", reason: "rate_limited" };
			yield { type: "done" };
			return;
		}
		if (isRepeat(session.principal.sub, parsed.data.threadId, parsed.data.message)) {
			yield { type: "refusal", reason: "duplicate" };
			yield { type: "done" };
			return;
		}
		if (apiKey === undefined) {
			fail("model", new Error("no API key"));
			yield { type: "refusal", reason: "unavailable" };
			yield { type: "done" };
			return;
		}
		yield* runTurn({
			agent,
			session,
			input: parsed.data,
			instructions: staffInstructions(session.copy),
			memory,
			detector,
			timeouts,
			signal: control?.signal,
			onFailure: fail,
		});
	}

	return {
		mastra,
		agent,
		hasApiKey: apiKey !== undefined,
		chat,
		async confirm(port, proposalId, fallback = "ro") {
			const session = port === undefined ? undefined : await open(port, {});
			if (session === undefined)
				return unconfirmed(staffCopy(fallback), proposalId, "no_principal");
			return confirmProposal(session, proposalId);
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
