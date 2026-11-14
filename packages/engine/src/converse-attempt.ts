import { RequestContext } from "@mastra/core/request-context";
import { MODEL_KEY } from "./agent";
import type { AskContext, ThreadAgent } from "./ask-context";
import { within } from "./deadline";
import type { AskInput, EngineEvent } from "./events";
import { AnswerTurn, MAX_TOOL_CALLS, TURN_KEY } from "./grounding/agent-tools";
import type { ArticleLink } from "./grounding/article-tool";
import type { ScopedSearch } from "./grounding/knowledge-tool";
import { SourceLedger } from "./grounding/ledger";
import type { ServiceFact } from "./grounding/services-tool";
import type { LanguagePack } from "./language/pack";
import type { ThreadKey } from "./memory";
import { earlierPages, pagePassage, renderPage } from "./page-context";
import type { ProfileLocale } from "./profile";
import type { AttemptTiming, ToolTiming } from "./timing";
import { type ModelUsage, stepTokens, USAGE_WAIT_MS, usageOf } from "./usage";

/** Longest reply the model may write, in tokens; room is left for the model's own reasoning. */
const MAX_OUTPUT_TOKENS = 4_096;
/** The most earlier turns the model reads. */
export const HISTORY_TURNS = 10;

/**
 * The longest wait for a model call's first chunk. A provider that has not started by then is
 * stuck (a failing route): the one retry goes out at once instead of after the idle budget.
 */
const FIRST_CHUNK_MS = 8_000;

/** Characters written before the language is judged mid-stream. */
const LANGUAGE_PROBE_CHARS = 80;

type ModelMessage = { role: "user"; content: string } | { role: "assistant"; content: string };

export type Attempt =
	| {
			kind: "ok";
			text: string;
			ledger: SourceLedger;
			shown: ReadonlyArray<string>;
			articles: ReadonlyArray<ArticleLink>;
			services: ReadonlyArray<ServiceFact>;
	  }
	/** Clearly in another language after its first sentences: stopped early, to be retried. */
	| { kind: "language" }
	| { kind: "error"; error: unknown };

/** Streamed so far, as the visitor sees it: what `replace` resets. */
export interface Display {
	text: string;
}

/** The turn's clock: when it started, each model call and tool call, the first visible text. */
export interface TurnClock {
	start: number;
	firstText: number | null;
	attempts: Array<AttemptTiming>;
	tools: Array<ToolTiming>;
}

/**
 * The limits of a turn the organisation's stored settings govern (`visitor-governance.ts`). Absent: the engine's own
 * (four tool calls, 4 096 answer tokens, ten earlier turns, no token budget per turn).
 */
export interface TurnLimits {
	/** The longest answer one model call may write (already the lower of it and `perRequestTokens`). */
	maxOutputTokens: number;
	/** Tool calls in one reply. */
	maxToolCalls: number;
	/** Earlier turns the model reads. */
	historyTurns: number;
	/** Prompt and answer of the turn's steps together; reached, the reply is written with no more tools. */
	perRequestTokens: number;
	/** The longest silence in the stream (the lower of it and the engine's own). */
	idleMs: number;
}

export interface ConverseArgs {
	ctx: AskContext;
	input: AskInput;
	pack: LanguagePack;
	instructions: string;
	/** Per-call notes: the visitor's language, an out-of-scope question. */
	notes: ReadonlyArray<string>;
	search: ScopedSearch;
	signal: AbortSignal;
	/** The visitor's own signal: aborted means a newer question replaced this one. */
	callerSignal: AbortSignal | undefined;
	clock: TurnClock;
	/** The profile's wording for this turn (in the owner's style), for the claims evidence. */
	own: ProfileLocale | undefined;
	/** Copy the owner set that the reply may say as written (the redirect line), as evidence too. */
	ownCopy: ReadonlyArray<string>;
	/** This turn's sampling temperature (the owner's creativity, or the store's). */
	temperature: number;
	/** The answering model for this turn (a slug, or `primary,fallback…`); undefined: the engine's. */
	model?: string;
	/** The store's limits for this turn; undefined on a site the store does not govern. */
	limits?: TurnLimits;
	/** What each model call used, one promise per call (a retry too), for the meters. */
	usages?: Array<Promise<ModelUsage>>;
}

function conversation(input: AskInput, useHistory: boolean, turns: number): Array<ModelMessage> {
	const earlier: Array<ModelMessage> = useHistory
		? (input.history ?? [])
				.slice(-turns)
				.map(
					(turn): ModelMessage =>
						turn.role === "guide"
							? { role: "assistant", content: turn.text }
							: { role: "user", content: turn.text },
				)
		: [];
	return [...earlier, { role: "user", content: input.question }];
}

/** Removes the gap a dropped citation leaves before a full stop. */
export function tidy(text: string): string {
	return text.replace(/[ \t]+([.,;:!?])/g, "$1");
}

/** Where streamed text may be cut: before an unclosed "[", so a citation goes out whole. */
function safeEnd(raw: string): number {
	const open = raw.lastIndexOf("[");
	return open > raw.lastIndexOf("]") && raw.length - open <= 12 ? open : raw.length;
}

/** Resets what the visitor sees, when anything is on screen. */
export function* reset(display: Display, text = ""): Generator<EngineEvent, void, undefined> {
	if (display.text === text) return;
	display.text = text;
	yield { type: "replace", text };
}

/**
 * One model call with the profile's tools, streamed: the text goes out as the model writes it
 * (its citations renumbered, a citation never cut in two); text written before a tool call is a
 * preamble and is reset. Returns the reply's whole raw text for the checks.
 */
export async function* attempt(
	args: ConverseArgs,
	note: string | undefined,
	runs: Array<Promise<unknown>>,
	display: Display,
): AsyncGenerator<EngineEvent, Attempt, undefined> {
	const { ctx, input, signal, limits } = args;
	const idleMs = Math.min(ctx.timeouts.idleMs, limits?.idleMs ?? ctx.timeouts.idleMs);
	const ledger = new SourceLedger();
	const turn = new AnswerTurn(
		ledger,
		input.locale,
		args.search,
		limits?.maxToolCalls ?? MAX_TOOL_CALLS,
	);
	if (input.page !== undefined && input.page.status !== "published") {
		turn.hiddenUrl = input.page.url;
	}
	// The page the visitor is reading: a published page's excerpt is the first, citable source.
	const passage = input.page === undefined ? undefined : pagePassage(input.page);
	const numbered = passage === undefined ? undefined : ledger.register([passage])[0];
	const pageSection =
		input.page === undefined
			? undefined
			: renderPage(
					args.pack,
					input.page,
					numbered?.n,
					earlierPages(input.history ?? [], input.page),
				);
	const threads: ThreadAgent | undefined =
		input.threadId !== undefined && ctx.threadAgent !== undefined ? ctx.threadAgent() : undefined;
	const agent = threads?.agent ?? ctx.agent;
	if (agent === undefined) return { kind: "error", error: new Error("no agent") };
	const key: ThreadKey | undefined =
		input.threadId === undefined
			? undefined
			: { threadId: `${ctx.profile.id}-${input.threadId}`, resourceId: ctx.resourceId };
	const system = [
		...args.notes,
		...(pageSection === undefined ? [] : [pageSection]),
		...(note === undefined ? [] : [note]),
	].join("\n\n");
	// Model steps per reply: the tool rounds, then the reply.
	const maxSteps = (limits?.maxToolCalls ?? MAX_TOOL_CALLS) + 2;
	const t0 = Date.now();
	const timing: AttemptTiming = { firstChunkMs: -1, firstTextMs: null, rounds: 1, ms: 0 };
	let output:
		| { totalUsage: PromiseLike<unknown>; providerMetadata: PromiseLike<unknown> }
		| undefined;
	try {
		const stream = await within(
			agent.stream(
				conversation(input, threads === undefined, limits?.historyTurns ?? HISTORY_TURNS),
				{
					instructions: args.instructions,
					...(system === "" ? {} : { system }),
					requestContext: new RequestContext<unknown>([
						[TURN_KEY, turn],
						...(args.model === undefined ? [] : [[MODEL_KEY, args.model] as const]),
					]),
					maxSteps,
					// A governed turn that reached its token budget writes its reply with what it has: no more tools.
					...(limits === undefined
						? {}
						: {
								prepareStep: ({ steps }: { steps: ReadonlyArray<unknown> }) => {
									if (stepTokens(steps) < limits.perRequestTokens) return undefined;
									turn.stopTools();
									return { toolChoice: "none" as const };
								},
							}),
					maxProcessorRetries: 0,
					abortSignal: signal,
					modelSettings: {
						maxRetries: 0,
						maxOutputTokens: limits?.maxOutputTokens ?? MAX_OUTPUT_TOKENS,
						temperature: args.temperature,
					},
					...(threads !== undefined && key !== undefined
						? { memory: { thread: key.threadId, resource: key.resourceId } }
						: {}),
				},
			),
			Math.min(idleMs, FIRST_CHUNK_MS),
			"model start",
			signal,
		);
		output = stream;
		// The figures are read at the end of the turn, or never: a failed stream must not leave them unhandled.
		Promise.resolve(stream.totalUsage).catch(() => undefined);
		Promise.resolve(stream.providerMetadata).catch(() => undefined);
		runs.push(stream.finishReason.catch(() => undefined));
		const reader = stream.fullStream.getReader();
		let raw = "";
		let sent = 0;
		let citer = ledger.citer();
		let judged = false;
		let finish: string | undefined;
		try {
			for (;;) {
				const wait = timing.firstChunkMs < 0 ? Math.min(idleMs, FIRST_CHUNK_MS) : idleMs;
				const next = await within(reader.read(), wait, "model stream", signal);
				if (next.done) break;
				const chunk = next.value;
				// Mastra opens every stream with its own start chunks: the provider's first is the next.
				if (timing.firstChunkMs < 0 && chunk.type !== "start" && chunk.type !== "step-start") {
					timing.firstChunkMs = Date.now() - t0;
				}
				if (chunk.type === "step-finish") timing.rounds += 1;
				if (chunk.type === "text-delta") {
					raw += chunk.payload.text;
					if (!judged && raw.length >= LANGUAGE_PROBE_CHARS) {
						judged = true;
						if (ctx.languages.isOther(raw, input.locale)) return { kind: "language" };
					}
					const end = safeEnd(raw);
					const piece = raw.slice(sent, end);
					sent = end;
					const shown = tidy(citer.rewrite(display.text === "" ? piece.trimStart() : piece));
					if (shown !== "") {
						timing.firstTextMs ??= Date.now() - t0;
						args.clock.firstText ??= Date.now() - args.clock.start;
						display.text += shown;
						yield { type: "text", delta: shown };
					}
				} else if (chunk.type === "tool-call-input-streaming-start") {
					yield { type: "thinking", stage: "searching" };
				} else if (chunk.type === "tool-call") {
					// Text written before a tool call is a preamble ("let me look"): the reply follows.
					raw = "";
					sent = 0;
					citer = ledger.citer();
					judged = false;
					yield* reset(display);
				} else if (chunk.type === "error") return { kind: "error", error: chunk.payload.error };
				else if (chunk.type === "abort" || chunk.type === "tripwire") {
					return { kind: "error", error: new Error(chunk.type) };
				} else if (chunk.type === "finish") finish = chunk.payload.stepResult.reason;
			}
		} finally {
			reader.cancel().catch(() => undefined);
		}
		if (finish !== "stop") {
			return { kind: "error", error: new Error(`finished with reason ${finish ?? "none"}`) };
		}
		const rest = tidy(citer.rewrite(raw.slice(sent)));
		if (rest !== "") {
			timing.firstTextMs ??= Date.now() - t0;
			args.clock.firstText ??= Date.now() - args.clock.start;
			display.text += rest;
			yield { type: "text", delta: rest };
		}
		if (raw.trim() === "") return { kind: "error", error: new Error("empty reply") };
		return {
			kind: "ok",
			text: raw.trim(),
			ledger,
			shown: turn.shown,
			articles: turn.articles,
			services: turn.services,
		};
	} catch (error) {
		return { kind: "error", error };
	} finally {
		timing.ms = Date.now() - t0;
		// The last step's finish counts as a round too: rounds are steps, not their boundaries.
		timing.rounds = Math.max(1, timing.rounds - 1);
		args.clock.attempts.push(timing);
		args.clock.tools.push(...turn.timings);
		// What the call used is counted whatever it came to: the provider may have charged for it.
		if (output !== undefined && args.usages !== undefined) {
			args.usages.push(usageOf(output, AbortSignal.timeout(USAGE_WAIT_MS * 2)));
		}
	}
}
