import type { Agent } from "@mastra/core/agent";
import type { Memory } from "@mastra/memory";
import { compactThread, type Summariser } from "../compaction";
import type { LanguageDetector } from "../language/detect";
import { stampRetention } from "../memory-retention";
import type { RateLimiter } from "../screening/rate-limit";
import { redactIdentifiers } from "../screening/redact-text";
import {
	NO_STAFF_USAGE,
	refusalOf,
	type StaffConfig,
	type StaffUsage,
	standingInstructions,
} from "./assistant-config";
import { governed, RefusalTracker } from "./conversation-policy";
import {
	type StaffEvent,
	type StaffPage,
	type StaffTurnInput,
	StaffTurnInputSchema,
} from "./events";
import { baseKeys } from "./parity/needs";
import type { StaffPort } from "./port";
import type { StaffSession } from "./session";
import { runTurn, type TurnTimeouts, threadKey } from "./turn";

/** One finished turn's question and answer, for the app's log (only when the organisation keeps transcripts). */
export interface StaffTranscript {
	sub: string;
	threadId: string;
	question: string;
	answer: string;
}

/** Reports a failing stage; `redact` (the organisation's `logging.redactPii`; on when unknown) hides identifiers. */
export type FailureReporter = (stage: string, error: unknown, redact?: boolean) => void;

export interface ChatDeps {
	agent: Agent;
	memory: Memory;
	detector: LanguageDetector;
	limiter: RateLimiter;
	timeouts: TurnTimeouts;
	hasApiKey: boolean;
	now: () => number;
	summarise: Summariser;
	open(
		port: StaffPort,
		input: { page?: StaffPage; threadId?: string },
	): Promise<StaffSession | undefined>;
	fail: FailureReporter;
	onTranscript?: (t: StaffTranscript) => void;
}

/** An identical message in the same conversation inside this window is the person pressing twice. */
const REPEAT_WINDOW_MS = 5_000;
/** The most conversations whose length is remembered; the oldest is forgotten first. */
const MAX_TRACKED = 20_000;

const sum = (a: StaffUsage, b: StaffUsage | undefined): StaffUsage =>
	b === undefined
		? a
		: {
				inputTokens: a.inputTokens + b.inputTokens,
				outputTokens: a.outputTokens + b.outputTokens,
				cachedTokens: a.cachedTokens + b.cachedTokens,
				costMicroUsd: a.costMicroUsd + b.costMicroUsd,
				limitHit: a.limitHit || b.limitHit,
			};

type Ready =
	| { kind: "refused"; reason: "invalid" | "no_principal" | "unavailable" }
	| { kind: "ready"; session: StaffSession; config: StaffConfig; input: StaffTurnInput };

/**
 * The staff turn as the engine runs it: the input parsed, the person's session and configuration read (without them no
 * turn runs), then the organisation's limits, a long conversation folded, the model's turn, and the retention stamped
 * on the conversation. Its events go out through the organisation's handoff; a turn of an organisation that keeps
 * transcripts hands its question and answer to `onTranscript`.
 */
export type StaffChat = (
	port: StaffPort,
	raw: unknown,
	control?: { signal?: AbortSignal },
) => AsyncGenerator<StaffEvent, void, undefined>;

export function createChat(deps: ChatDeps): StaffChat {
	const recent = new Map<string, number>();
	const lengths = new Map<string, number>();
	const refusals = new RefusalTracker();
	const isRepeat = (thread: string, message: string): boolean => {
		const at = deps.now();
		for (const [key, when] of recent) if (at - when > REPEAT_WINDOW_MS) recent.delete(key);
		const key = `${thread}\u0000${message.trim().replace(/\s+/g, " ").toLowerCase()}`;
		if (recent.has(key)) return true;
		recent.set(key, at);
		return false;
	};

	async function prepare(port: StaffPort, raw: unknown): Promise<Ready> {
		const parsed = StaffTurnInputSchema.safeParse(raw);
		if (!parsed.success) return { kind: "refused", reason: "invalid" };
		const session = await deps.open(port, {
			page: parsed.data.page,
			threadId: parsed.data.threadId,
		});
		if (session === undefined) return { kind: "refused", reason: "no_principal" };
		const caps = await session.port.capabilities();
		session.caps = caps.ok ? baseKeys(caps.value.permissions) : undefined;
		// What governs this turn, asked of the service as this person; without it no turn runs (its limits could not hold).
		const configured = await session.port.assistant();
		if (!configured.ok) {
			deps.fail("config", new Error(`the configuration was refused: ${configured.reason}`));
			return { kind: "refused", reason: "unavailable" };
		}
		return { kind: "ready", session, config: configured.value, input: parsed.data };
	}

	async function* configured(
		ready: Extract<Ready, { kind: "ready" }>,
		thread: string,
		signal: AbortSignal | undefined,
	): AsyncGenerator<StaffEvent, void, undefined> {
		const { session, config, input } = ready;
		const settings = config.settings;
		const fail = (stage: string, error: unknown): void =>
			deps.fail(stage, error, settings.logging.redactPii);
		if (config.stop !== undefined) {
			// Counted, so the meters show how often a limit is met; nothing else is.
			await session.port.recordUsage({ ...NO_STAFF_USAGE, limitHit: true });
			yield { type: "refusal", reason: refusalOf(config.stop) };
			yield { type: "done" };
			return;
		}
		session.config = config;
		const sub = session.principal.sub;
		if (
			!(await deps.limiter.take(`staff:${sub}`, {
				limit: settings.ratePerMinute,
				windowMs: 60_000,
			}))
		) {
			yield { type: "refusal", reason: "rate_limited" };
			yield { type: "done" };
			return;
		}
		const said = (lengths.get(thread) ?? 0) + 1;
		if (said > settings.messages.perSession) {
			yield { type: "refusal", reason: "session_limit" };
			yield { type: "done" };
			return;
		}
		if (lengths.size >= MAX_TRACKED) lengths.delete(lengths.keys().next().value ?? "");
		lengths.set(thread, said);
		if (isRepeat(thread, input.message)) {
			yield { type: "refusal", reason: "duplicate" };
			yield { type: "done" };
			return;
		}
		if (!deps.hasApiKey) {
			fail("model", new Error("no API key"));
			yield { type: "refusal", reason: "unavailable" };
			yield { type: "done" };
			return;
		}
		const key = threadKey(sub, input.threadId);
		// A long conversation's older part is folded into a summary before the turn reads it back; what that cost is
		// counted with the turn.
		let folded: StaffUsage | undefined;
		let summary: string | undefined;
		try {
			const outcome = await compactThread({
				memory: deps.memory,
				key,
				settings,
				summarise: deps.summarise,
				heading: session.copy.summaryHeading,
				...(signal === undefined ? {} : { signal }),
			});
			if (outcome.kind === "compacted") folded = outcome.usage;
			summary = outcome.summary;
		} catch (error) {
			fail("compaction", error);
		}
		yield* runTurn({
			agent: deps.agent,
			session,
			input,
			...(summary === undefined ? {} : { summary }),
			instructions: standingInstructions(session.copy, config),
			memory: deps.memory,
			detector: deps.detector,
			timeouts: {
				idleMs: Math.min(deps.timeouts.idleMs, settings.timeouts.idleMs),
				totalMs: Math.min(deps.timeouts.totalMs, settings.timeouts.totalMs),
			},
			signal,
			onFailure: fail,
			onUsage: async (used) => {
				const recorded = await session.port.recordUsage(sum(used, folded));
				folded = undefined;
				if (!recorded.ok) fail("usage", new Error(`the meters refused: ${recorded.reason}`));
			},
		});
		if (folded !== undefined) {
			const recorded = await session.port.recordUsage(folded);
			if (!recorded.ok) fail("usage", new Error(`the meters refused: ${recorded.reason}`));
		}
		try {
			await stampRetention(deps.memory, key, settings.memory.retentionDays);
		} catch (error) {
			fail("memory-retention", error);
		}
	}

	return async function* chat(
		port: StaffPort,
		raw: unknown,
		control?: { signal?: AbortSignal },
	): AsyncGenerator<StaffEvent, void, undefined> {
		const ready = await prepare(port, raw);
		if (ready.kind === "refused") {
			yield { type: "refusal", reason: ready.reason };
			yield { type: "done" };
			return;
		}
		const settings = ready.config.settings;
		const threadId = ready.input.threadId ?? "default";
		const sub = ready.session.principal.sub;
		const thread = `${sub}\u0000${threadId}`;
		const clean = (t: string): string => (settings.logging.redactPii ? redactIdentifiers(t) : t);
		yield* governed(configured(ready, thread, control?.signal), {
			thread,
			settings,
			copy: ready.session.copy,
			tracker: refusals,
			onFinished: (answer) => {
				if (!settings.logging.keepTranscripts || answer.trim() === "") return;
				try {
					deps.onTranscript?.({
						sub,
						threadId,
						question: clean(ready.input.message),
						answer: clean(answer),
					});
				} catch {
					// A failing log hook must not change the answer.
				}
			},
		});
	};
}
