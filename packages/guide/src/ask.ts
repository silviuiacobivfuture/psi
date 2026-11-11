import type { Agent } from "@mastra/core/agent";
import type { Memory } from "@mastra/memory";
import { AnswerGate, type GateStep } from "./answer-gate";
import type { Brand, Knowledge } from "./contract";
import { within } from "./deadline";
import { type AskInput, AskInputSchema, type GuideEvent, type RefusalReason } from "./events";
import { isCrisis } from "./guardrails/crisis";
import { isClinical, isOutOfScope } from "./guardrails/scope";
import { scopeSearch, searchKnowledgeTools } from "./knowledge-tool";
import { renderPassages, SourceLedger } from "./ledger";
import { instructionsFor, passagesPreamble } from "./prompts/instructions";

/** Time budgets for one answer, in milliseconds. */
export interface GuideTimeouts {
	/** One knowledge search. */
	retrievalMs: number;
	/** The longest silence between two pieces of the model's stream (covers the first token). */
	idleMs: number;
	/** The whole answer, retrieval included. */
	totalMs: number;
}

export const DEFAULT_TIMEOUTS: GuideTimeouts = {
	retrievalMs: 8_000,
	idleMs: 20_000,
	totalMs: 60_000,
};

/** Longest answer the model may write, in tokens; room is left for the model's own reasoning. */
const MAX_OUTPUT_TOKENS = 4_096;
/** Model steps per answer: the answer, or one more search and then the answer. */
const MAX_STEPS = 3;

/**
 * Why an answer became `unavailable`, for the app's logs. It names the stage and the error, never
 * the question, the passages or the answer.
 */
export interface GuideFailure {
	stage: "retrieval" | "model";
	error: string;
}

/** What `ask` needs from the guide that owns it. */
export interface AskContext {
	brand: Brand;
	knowledge: Knowledge;
	timeouts: GuideTimeouts;
	onFailure: ((failure: GuideFailure) => void) | undefined;
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

/** How long to wait for a refused run to settle before removing its answer from the thread. */
const FORGET_AFTER_MS = 5_000;

/** Where a consented thread lives in memory. */
interface ThreadKey {
	threadId: string;
	resourceId: string;
}

/**
 * Removes the answers of a run that did not reach the visitor complete (refused, failed or
 * abandoned) from the thread, so they never replay into the next prompt. The visitor's question
 * stays. It runs in the background once the run has settled, because Mastra saves the answer when
 * the run ends, and an aborted run saves it under a new message id: every guide message written
 * since the run started is removed.
 */
async function forgetAnswer(
	memory: Memory,
	key: ThreadKey,
	since: number,
	settled: Promise<unknown>,
): Promise<void> {
	try {
		await within(settled, FORGET_AFTER_MS, "run settle").catch(() => undefined);
		const { messages } = await memory.recall({ ...key, perPage: false });
		const written = messages
			.filter((m) => m.role === "assistant" && new Date(m.createdAt).getTime() >= since)
			.map((m) => m.id);
		if (written.length > 0) await memory.deleteMessages(written);
	} catch {
		// Nothing more can be done here; the next answer is still checked on its own.
	}
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

/** Guardrails that run before anything leaves the process. */
function screen(raw: unknown): { input: AskInput } | { reason: RefusalReason } {
	const question = rawQuestion(raw);
	if (question !== undefined && isCrisis(question)) return { reason: "crisis" };
	const parsed = AskInputSchema.safeParse(raw);
	if (!parsed.success) return { reason: "out_of_scope" };
	if (isOutOfScope(parsed.data.question)) return { reason: "out_of_scope" };
	return { input: parsed.data };
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
	signal?: AbortSignal,
): AsyncGenerator<GuideEvent, void, undefined> {
	const screened = screen(raw);
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

		const threads =
			input.threadId !== undefined && ctx.threadAgent !== undefined ? ctx.threadAgent() : undefined;
		const threaded = threads !== undefined;
		const agent = threads?.agent ?? ctx.agent;
		const key: ThreadKey | undefined =
			input.threadId === undefined
				? undefined
				: { threadId: `${ctx.brand}-${input.threadId}`, resourceId: `psi-guide-${ctx.brand}` };
		const since = Date.now();
		const started = agent.stream(conversation(input, !threaded), {
			instructions: instructionsFor(ctx.brand, input.locale),
			system: `${passagesPreamble(input.locale)}\n${renderPassages(numbered)}`,
			toolsets: { knowledge: searchKnowledgeTools(search, ledger) },
			maxSteps: MAX_STEPS,
			maxProcessorRetries: 0,
			abortSignal: controller.signal,
			modelSettings: { maxRetries: 0, maxOutputTokens: MAX_OUTPUT_TOKENS },
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
		});
		const emit = (step: GateStep): GuideEvent | undefined => {
			if (step.kind === "refuse") return { type: "refusal", reason: step.reason };
			return step.text.length > 0 ? { type: "text", delta: step.text } : undefined;
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
				const event = emit(gate.push(chunk.payload.text));
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

		const last = emit(gate.end());
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
