import type { Agent } from "@mastra/core/agent";
import type { Memory } from "@mastra/memory";
import type { z } from "zod";
import type { BookingScope } from "./booking";
import type { Summariser } from "./compaction";
import type { EngineKnowledge } from "./contract";
import type { AskInput } from "./events";
import type { EngineScore, Faithfulness } from "./grounding/faithfulness";
import type { LanguageDetector } from "./language/detect";
import type { LanguagePack } from "./language/pack";
import type { ChatModel } from "./model";
import type { Profile } from "./profile";
import type { ScreeningRules } from "./screening/chain";
import type { RateLimiter } from "./screening/rate-limit";
import type { SettingsSource } from "./settings";
import type { EngineTiming } from "./timing";
import type { GovernanceSource } from "./visitor-governance";
import type { RefusalCounter } from "./visitor-turn";

/** Time budgets for one answer, in milliseconds. */
export interface EngineTimeouts {
	/** One knowledge search. */
	retrievalMs: number;
	/** The model guardrails (run in parallel), and the app's rate limiter. */
	screeningMs: number;
	/** The longest silence between two pieces of the model's stream (covers the first token). */
	idleMs: number;
	/** The whole answer, retrieval included. */
	totalMs: number;
}

export const DEFAULT_TIMEOUTS: EngineTimeouts = {
	retrievalMs: 8_000,
	screeningMs: 8_000,
	idleMs: 20_000,
	totalMs: 60_000,
};

/** Which stage of an answer failed. */
export type FailureStage =
	| "retrieval"
	| "model"
	| "screening"
	| "rate_limit"
	/** The settings provider failed; the last good settings (or the defaults) were used. */
	| "settings"
	/** The guide is switched off (`guideEnabled: false`). */
	| "disabled"
	/** Embeddings failed or the breaker is open: the search fell back to the lexical tier. */
	| "embeddings_degraded"
	/** The configured embedding model has no index yet: lexical until a re-ingest builds it. */
	| "index_missing"
	/** A reply failed a post-check (language, an unsupported fact, grammar, a repeat): counts only. */
	| "check"
	/** The conversation memory's retention sweep failed; it runs again later. */
	| "memory"
	/** The organisation's meters did not take a turn's use. */
	| "usage"
	/** A long conversation could not be folded into its summary; the turn went on with it whole. */
	| "compaction";

/**
 * Why a stage failed, for the app's logs. It names the profile, the stage and the error, never
 * the question, the passages or the answer. A stage failing does not by itself make the answer
 * `unavailable`: only the model provider failing twice does (a small talk turn then gets the
 * profile's canned line).
 */
export interface EngineFailure {
	profile: string;
	stage: FailureStage;
	error: string;
}

/** Per-ask controls from the app. */
export interface AskControl {
	/** Aborts the answer (e.g. the visitor closed the SSE connection). */
	signal?: AbortSignal;
	/**
	 * The client the rate limit counts against: a hash of the session or the IP, never a name or
	 * an e-mail. Without it the engine does not rate-limit.
	 */
	clientId?: string;
	/**
	 * The visitor's keys for the exchange limit (e.g. a session cookie id, a browser cookie id, a
	 * daily-salted fingerprint hash), each counted on its own: over the limit on any one refuses
	 * `exchange_limit`. Never a name, an e-mail or a raw address. Without keys no exchange limit
	 * applies.
	 */
	visitorKeys?: ReadonlyArray<string>;
	/**
	 * Settings for this turn only, over the provider's (the control plane's preview of unsaved
	 * settings), parsed like a provider's answer. Never kept: the next turn reads the provider
	 * again, and nothing a visitor sends should ever reach this.
	 */
	settings?: unknown;
}

/** A setting the engine needs and was not given: it names the setting, never a secret. */
export class ConfigurationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ConfigurationError";
	}
}

/** The agent that serves consented threads, and the memory it writes to. */
export interface ThreadAgent {
	agent: Agent;
	memory: Memory;
}

/** Everything one profile's answers need, resolved once by `createEngine`. */
export interface AskContext {
	profile: Profile;
	/** The language pack of each of the profile's locales. */
	packs: ReadonlyMap<string, LanguagePack>;
	inputSchema: z.ZodType<AskInput, z.ZodTypeDef, unknown>;
	languages: LanguageDetector;
	screening: ScreeningRules;
	faithfulness: Faithfulness;
	knowledge: EngineKnowledge;
	timeouts: EngineTimeouts;
	rateLimiter: RateLimiter;
	/** Counts exchanges per visitor key, with the settings' limit and window. */
	exchangeLimiter: RateLimiter;
	settings: SettingsSource;
	onFailure: ((failure: EngineFailure) => void) | undefined;
	onScore: ((score: EngineScore) => void) | undefined;
	/** Where each turn's time went (counts and milliseconds only), for the app's debug log. */
	onTiming?: ((timing: EngineTiming) => void) | undefined;
	/**
	 * Builds the model the guardrail processors call, telling `onError` what failed; undefined when
	 * model screening is off.
	 */
	screeningModel: ((onError: (error: Error) => void) => ChatModel) | undefined;
	/** The agent with no memory, or undefined when there is no API key. */
	agent: Agent | undefined;
	/** The agent with memory, opened on first use; undefined when memory is not configured. */
	threadAgent: (() => ThreadAgent) | undefined;
	/** The memory resource this profile's threads belong to. */
	resourceId: string;
	/** Booking inside the conversation, when the profile schedules and a store was given. */
	booking?: BookingScope;
	/**
	 * The organisation's settings for this profile's visitor turns, when its store governs it (`visitor-governance.ts`);
	 * undefined: the CMS's settings and the engine's own limits.
	 */
	governance?: GovernanceSource;
	/** Refusals per conversation, for the organisation's hand-over to a person. */
	refusals: RefusalCounter;
	/**
	 * Folds a long kept conversation's older part into a summary with the organisation's `model.summary`
	 * (`memory.compactAfter`); on a governed site with a key and conversation memory only.
	 */
	summarise?: Summariser;
	/**
	 * What the app's log may hold, as the organisation's `logging.*` last said (the built-in on a governed site before any
	 * read; neither on a site not governed). Set at the start of each governed turn.
	 */
	logging: { redactPii: boolean; keepTranscripts: boolean };
	/** Hides addresses, phone numbers and personal numbers (the packs' PII rules). */
	redact: (text: string) => string;
	/** Each finished turn's question and answer, only when `logging.keepTranscripts`; redacted when `redactPii`. */
	onTranscript?: ((transcript: EngineTranscript) => void) | undefined;
}

/** One finished turn, as the app's log keeps it when the organisation keeps transcripts. */
export interface EngineTranscript {
	profile: string;
	locale: string;
	question: string;
	answer: string;
}

function describe(error: unknown): string {
	const text = error instanceof Error ? `${error.name}: ${error.message}` : "unknown error";
	return text.slice(0, 300);
}

/** A text for the app's log: redacted when the organisation says so. */
export function loggable(ctx: AskContext, text: string): string {
	return ctx.logging.redactPii ? ctx.redact(text) : text;
}

/** Reports a failed stage to the app; a failing hook never changes the answer. */
export function report(ctx: AskContext, stage: FailureStage, error: unknown): void {
	try {
		ctx.onFailure?.({ profile: ctx.profile.id, stage, error: loggable(ctx, describe(error)) });
	} catch {
		// A failing log hook must not change the answer.
	}
}
