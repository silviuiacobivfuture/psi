import type { Agent } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import type { Memory } from "@mastra/memory";
import { z } from "zod";
import { AnswerGate, type GateStep } from "./answer-gate";
import type { Brand, Knowledge } from "./contract";
import { within } from "./deadline";
import { type AskInput, AskInputSchema, type GuideEvent, type RefusalReason } from "./events";
import { type GuideScore, scoreAnswer } from "./faithfulness";
import { isCrisis } from "./guardrails/crisis";
import { detectLanguage } from "./guardrails/language";
import { isClinical, isOutOfScope } from "./guardrails/scope";
import { cleanText } from "./guardrails/unicode";
import { scopeSearch, searchKnowledgeTools } from "./knowledge-tool";
import { renderPassages, SourceLedger } from "./ledger";
import { forgetAnswer, type ThreadKey } from "./memory";
import { screenWithModel } from "./model-screening";
import { instructionsFor, languageNote, passagesPreamble } from "./prompts/instructions";
import { RateDecisionSchema, type RateLimiter } from "./rate-limit";
import { screenInput } from "./screening";

/** Time budgets for one answer, in milliseconds. */
export interface GuideTimeouts {
	/** One knowledge search. */
	retrievalMs: number;
	/** The model guardrails (run in parallel), and the app's rate limiter. */
	screeningMs: number;
	/** The longest silence between two pieces of the model's stream (covers the first token). */
	idleMs: number;
	/** The whole answer, retrieval included. */
	totalMs: number;
}

export const DEFAULT_TIMEOUTS: GuideTimeouts = {
	retrievalMs: 8_000,
	screeningMs: 8_000,
	idleMs: 20_000,
	totalMs: 60_000,
};

/** Longest answer the model may write, in tokens; room is left for the model's own reasoning. */
const MAX_OUTPUT_TOKENS = 4_096;
/** Model steps per answer: the answer, or one more search and then the answer. */
const MAX_STEPS = 3;
/** Low, so the answer stays close to the passages' wording. */
export const ANSWER_TEMPERATURE = 0.1;

/**
 * Why a stage failed, for the app's logs. It names the stage and the error, never the question,
 * the passages or the answer. `model` and `retrieval` failures make the answer `unavailable`;
 * so do `rate_limit` and `screening` (the injection detector fails closed).
 */
export interface GuideFailure {
	stage: "retrieval" | "model" | "screening" | "rate_limit";
	error: string;
}

/** Per-ask controls from the app. */
export interface AskControl {
	/** Aborts the answer (e.g. the visitor closed the SSE connection). */
	signal?: AbortSignal;
	/**
	 * The client the rate limit counts against: a hash of the session or the IP, never a name or
	 * an e-mail. Without it the guide does not rate-limit.
	 */
	clientId?: string;
}

const ClientIdSchema = z.string().trim().min(1).max(256).optional();

/** What `ask` needs from the guide that owns it. */
export interface AskContext {
	brand: Brand;
	knowledge: Knowledge;
	timeouts: GuideTimeouts;
	onFailure: ((failure: GuideFailure) => void) | undefined;
	onScore: ((score: GuideScore) => void) | undefined;
	rateLimiter: RateLimiter;
	/** The model the guardrail processors call, or undefined when model screening is off. */
	screeningModel: MastraModelConfig | undefined;
	/** The agent with no memory, or undefined when there is no API key. */
	agent: Agent | undefined;
	/** The agent with memory, opened on first use; undefined when memory is not configured. */
	threadAgent: (() => ThreadAgent) | undefined;
}

/** The agent that serves consented threads, and the memory it writes to. */
export interface ThreadAgent {
	agent: Agent;
	memory: Memory;
}

type ModelMessage = { role: "user"; content: string } | { role: "assistant"; content: string };

function refusal(reason: RefusalReason): ReadonlyArray<GuideEvent> {
	return [{ type: "refusal", reason }, { type: "done" }];
}

/** The question as sent, if any, before validation, so crisis language is never missed. */
function rawQuestion(raw: unknown): string | undefined {
	if (typeof raw !== "object" || raw === null || !("question" in raw)) return undefined;
	return typeof raw.question === "string" ? raw.question : undefined;
}

function describe(error: unknown): string {
	const text = error instanceof Error ? `${error.name}: ${error.message}` : "unknown error";
	return text.slice(0, 300);
}

function report(ctx: AskContext, stage: GuideFailure["stage"], error: unknown): void {
	try {
		ctx.onFailure?.({ stage, error: describe(error) });
	} catch {
		// A failing log hook must not change the answer.
	}
}

async function scored(ctx: AskContext, answer: string, ledger: SourceLedger): Promise<GuideScore> {
	const score = await scoreAnswer(answer, ledger.passageTexts());
	try {
		ctx.onScore?.(score);
	} catch {
		// A failing log hook must not change the answer.
	}
	return score;
}

/** Counts the question against the client's limit. The limiter failing refuses (fails closed). */
async function rateLimit(
	ctx: AskContext,
	control: AskControl | undefined,
): Promise<RefusalReason | undefined> {
	try {
		const clientId = ClientIdSchema.parse(control?.clientId);
		if (clientId === undefined) return undefined;
		const decision = await within(
			Promise.resolve().then(() => ctx.rateLimiter.take(clientId)),
			ctx.timeouts.screeningMs,
			"rate limiter",
		);
		return RateDecisionSchema.parse(decision) ? undefined : "rate_limited";
	} catch (error) {
		report(ctx, "rate_limit", error);
		return "unavailable";
	}
}

/**
 * The guardrails that need no model, before anything leaves the process: crisis (on the raw and
 * the cleaned text, so invisible characters cannot hide it), the rate limit, validation, the
 * deterministic chain (`screenInput`) and scope.
 */
async function screen(
	ctx: AskContext,
	raw: unknown,
	control: AskControl | undefined,
): Promise<{ input: AskInput } | { reason: RefusalReason }> {
	const question = rawQuestion(raw);
	if (question !== undefined && (isCrisis(question) || isCrisis(cleanText(question)))) {
		return { reason: "crisis" };
	}
	const limited = await rateLimit(ctx, control);
	if (limited !== undefined) return { reason: limited };
	const parsed = AskInputSchema.safeParse(raw);
	if (!parsed.success) return { reason: "out_of_scope" };
	let screened: Awaited<ReturnType<typeof screenInput>>;
	try {
		screened = await screenInput(parsed.data);
	} catch (error) {
		report(ctx, "screening", error);
		return { reason: "unavailable" };
	}
	if ("reason" in screened) return screened;
	if (isOutOfScope(screened.input.question)) return { reason: "out_of_scope" };
	return screened;
}

function conversation(input: AskInput, useHistory: boolean): Array<ModelMessage> {
	const earlier: Array<ModelMessage> = useHistory
		? (input.history ?? []).map(
				(turn): ModelMessage =>
					turn.role === "guide"
						? { role: "assistant", content: turn.text }
						: { role: "user", content: turn.text },
			)
		: [];
	return [...earlier, { role: "user", content: input.question }];
}

/**
 * One answer, as events. Never throws and never hangs: every failure becomes a refusal, every wait
 * has a deadline, and stopping the iteration aborts the model call.
 */
export async function* runAsk(
	ctx: AskContext,
	raw: unknown,
	control?: AskControl,
): AsyncGenerator<GuideEvent, void, undefined> {
	const screened = await screen(ctx, raw, control);
	if ("reason" in screened) {
		yield* refusal(screened.reason);
		return;
	}
	const { input } = screened;
	if (ctx.agent === undefined) {
		yield* refusal("unavailable");
		return;
	}
	yield { type: "thinking" };

	const signal = control?.signal;
	const controller = new AbortController();
	const abort = (): void => controller.abort();
	signal?.addEventListener("abort", abort, { once: true });
	if (signal?.aborted === true) controller.abort();
	const deadline = setTimeout(abort, ctx.timeouts.totalMs);
	let release: (() => void) | undefined;
	let forget: (() => void) | undefined;
	let answered = false;
	try {
		const ledger = new SourceLedger();
		// The configured locale is fixed before retrieval: the index is searched in it, whatever
		// language the visitor wrote in.
		const search = scopeSearch({
			knowledge: ctx.knowledge,
			brand: ctx.brand,
			locale: input.locale,
			timeoutMs: ctx.timeouts.retrievalMs,
			signal: controller.signal,
		});
		let passages: Awaited<ReturnType<typeof search>>;
		try {
			passages = await search(input.question);
		} catch (error) {
			report(ctx, "retrieval", error);
			yield* refusal("unavailable");
			return;
		}
		if (passages.length === 0) {
			yield* refusal("no_content");
			return;
		}
		const numbered = ledger.register(passages);

		if (ctx.screeningModel !== undefined) {
			const verdict = await screenWithModel({
				model: ctx.screeningModel,
				question: input.question,
				timeoutMs: ctx.timeouts.screeningMs,
				signal: controller.signal,
			});
			if (verdict.kind === "failed") report(ctx, "screening", verdict.error);
			if (verdict.kind !== "pass") {
				yield* refusal(verdict.kind === "refuse" ? verdict.reason : "unavailable");
				return;
			}
		}

		const threads =
			input.threadId !== undefined && ctx.threadAgent !== undefined ? ctx.threadAgent() : undefined;
		const threaded = threads !== undefined;
		const agent = threads?.agent ?? ctx.agent;
		const key: ThreadKey | undefined =
			input.threadId === undefined
				? undefined
				: { threadId: `${ctx.brand}-${input.threadId}`, resourceId: `psi-guide-${ctx.brand}` };
		const note = languageNote(input.locale, detectLanguage(input.question));
		const since = Date.now();
		const started = agent.stream(conversation(input, !threaded), {
			instructions: instructionsFor(ctx.brand, input.locale),
			system: `${note === "" ? "" : `${note}\n`}${passagesPreamble(input.locale)}\n${renderPassages(numbered)}`,
			toolsets: { knowledge: searchKnowledgeTools(search, ledger, input.locale) },
			maxSteps: MAX_STEPS,
			maxProcessorRetries: 0,
			abortSignal: controller.signal,
			modelSettings: {
				maxRetries: 0,
				maxOutputTokens: MAX_OUTPUT_TOKENS,
				temperature: ANSWER_TEMPERATURE,
			},
			...(threaded && key !== undefined
				? { memory: { thread: key.threadId, resource: key.resourceId } }
				: {}),
		});
		const output = await within(started, ctx.timeouts.idleMs, "model start", controller.signal);
		if (threads !== undefined && key !== undefined) {
			forget = () => void forgetAnswer(threads.memory, key, since, output.finishReason);
		}

		const reader = output.fullStream.getReader();
		release = () => {
			reader.cancel().catch(() => undefined);
		};
		const gate = new AnswerGate({
			ledger,
			blockSisterBrands: ctx.brand === "psizone" && isClinical(input.question),
			locale: input.locale,
		});
		const emit = async (step: GateStep): Promise<GuideEvent | undefined> => {
			if (step.kind === "text") {
				return step.text.length > 0 ? { type: "text", delta: step.text } : undefined;
			}
			if (step.check === "language") {
				report(ctx, "model", new Error("answer not in the configured language"));
			} else if (step.reason === "no_content" && step.check !== "sentinel") {
				await scored(ctx, gate.rawText, ledger);
			}
			return { type: "refusal", reason: step.reason };
		};

		let finish: string | undefined;
		for (;;) {
			const next = await within(
				reader.read(),
				ctx.timeouts.idleMs,
				"model stream",
				controller.signal,
			);
			if (next.done) break;
			const chunk = next.value;
			if (chunk.type === "text-delta") {
				const event = await emit(gate.push(chunk.payload.text));
				if (event !== undefined) yield event;
				if (event?.type === "refusal") {
					yield { type: "done" };
					return;
				}
			} else if (chunk.type === "tool-call-input-streaming-start" || chunk.type === "tool-call") {
				gate.discardHeld();
			} else if (chunk.type === "error") {
				report(ctx, "model", chunk.payload.error);
				yield* refusal("unavailable");
				return;
			} else if (chunk.type === "abort" || chunk.type === "tripwire") {
				report(ctx, "model", new Error(chunk.type));
				yield* refusal("unavailable");
				return;
			} else if (chunk.type === "finish") {
				finish = chunk.payload.stepResult.reason;
			}
		}
		// Only a model that finished its answer counts: a cut-off ("length"), a filtered answer or
		// an error is not one.
		if (finish !== "stop") {
			report(ctx, "model", new Error(`finished with reason ${finish ?? "none"}`));
			yield* refusal("unavailable");
			return;
		}

		const last = await emit(gate.end());
		if (last?.type === "refusal") {
			yield* refusal(last.reason);
			return;
		}
		if (last !== undefined) yield last;
		const sources = ledger.citedSources();
		// An answer that cites no passage is not grounded, whatever it says.
		if (!gate.emitted || sources.length === 0) {
			yield* refusal("no_content");
			return;
		}
		// The whole answer, scored by Mastra's scorer: at least one claim, every claim supported.
		const score = await scored(ctx, gate.rawText, ledger);
		if (!score.passed) {
			yield* refusal("no_content");
			return;
		}
		answered = true;
		yield { type: "sources", sources };
		yield { type: "done" };
	} catch (error) {
		report(ctx, "model", error);
		yield* refusal("unavailable");
	} finally {
		clearTimeout(deadline);
		signal?.removeEventListener("abort", abort);
		release?.();
		controller.abort();
		if (!answered) forget?.();
	}
}
