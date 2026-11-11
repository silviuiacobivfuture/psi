import {
	type AskContext,
	type AskControl,
	ConfigurationError,
	report,
	type ThreadAgent,
} from "./ask-context";
import { screen } from "./ask-screen";
import { within } from "./deadline";
import type { AskInput, EngineEvent, RefusalReason } from "./events";
import { type ActiveCrossReference, AnswerGate, type GateStep } from "./grounding/answer-gate";
import type { EngineScore } from "./grounding/faithfulness";
import { scopeSearch, searchKnowledgeTools } from "./grounding/knowledge-tool";
import { renderPassages, SourceLedger } from "./grounding/ledger";
import type { LanguagePack } from "./language/pack";
import { forgetAnswer, type ThreadKey } from "./memory";
import { instructionsFor, languageNote } from "./prompt";
import { matchesRules } from "./rules";
import { screenWithModel } from "./screening/model";

/** Longest answer the model may write, in tokens; room is left for the model's own reasoning. */
const MAX_OUTPUT_TOKENS = 4_096;
/** Model steps per answer: the answer, or one more search and then the answer. */
const MAX_STEPS = 3;
/** Low, so the answer stays close to the passages' wording. */
export const ANSWER_TEMPERATURE = 0.1;

type ModelMessage = { role: "user"; content: string } | { role: "assistant"; content: string };

function refusal(reason: RefusalReason): ReadonlyArray<EngineEvent> {
	return [{ type: "refusal", reason }, { type: "done" }];
}

async function scored(ctx: AskContext, answer: string, ledger: SourceLedger): Promise<EngineScore> {
	const score = await ctx.faithfulness.score(answer, ledger.passageTexts());
	try {
		ctx.onScore?.(score);
	} catch {
		// A failing log hook must not change the answer.
	}
	return score;
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

/** The profile's cross-reference rules that this question triggers. */
function activeCrossReferences(
	ctx: AskContext,
	question: string,
): ReadonlyArray<ActiveCrossReference> {
	return (ctx.profile.crossReferences ?? [])
		.filter((rule) => matchesRules(question, rule.when))
		.map((rule) => ({ forbid: rule.forbid, refusal: rule.refusal }));
}

/** The pack and the profile's wording for the asked locale (validation guarantees both). */
function localeOf(ctx: AskContext, locale: string): { pack: LanguagePack; instructions: string } {
	const pack = ctx.packs.get(locale);
	const own = ctx.profile.locales[locale];
	if (pack === undefined || own === undefined) {
		throw new ConfigurationError(`profile ${ctx.profile.id} has no locale ${locale}`);
	}
	return { pack, instructions: instructionsFor(pack, own) };
}

/**
 * One answer, as events: screening, retrieval, the model guardrails, the agent, the per-sentence
 * gate, then the faithfulness scorer. Never throws and never hangs: every failure becomes a
 * refusal, every wait has a deadline, and stopping the iteration aborts the model call.
 */
export async function* runAsk(
	ctx: AskContext,
	raw: unknown,
	control?: AskControl,
): AsyncGenerator<EngineEvent, void, undefined> {
	const screened = await screen(ctx, raw, control);
	if ("reason" in screened) {
		yield* refusal(screened.reason);
		return;
	}
	const { input } = screened;
	if (ctx.agent === undefined) {
		report(ctx, "model", new ConfigurationError("no OpenRouter API key (OPENROUTER_API_KEY)"));
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
		const { pack, instructions } = localeOf(ctx, input.locale);
		const ledger = new SourceLedger();
		// The configured locale is fixed before retrieval: the index is searched in it, whatever
		// language the visitor wrote in.
		const search = scopeSearch({
			knowledge: ctx.knowledge,
			scope: ctx.profile.knowledgeScope,
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
			// The guardrails turn a provider error into a bare tripwire; keep the error itself.
			let providerError: unknown;
			const verdict = await screenWithModel({
				model: ctx.screeningModel((error) => {
					providerError ??= error;
				}),
				question: input.question,
				timeoutMs: ctx.timeouts.screeningMs,
				signal: controller.signal,
				prompts: ctx.profile.screening,
				runnerName: `${ctx.resourceId}-screening`,
			});
			if (verdict.kind === "failed") report(ctx, "screening", providerError ?? verdict.error);
			if (verdict.kind !== "pass") {
				yield* refusal(verdict.kind === "refuse" ? verdict.reason : "unavailable");
				return;
			}
		}

		const threads: ThreadAgent | undefined =
			input.threadId !== undefined && ctx.threadAgent !== undefined ? ctx.threadAgent() : undefined;
		const threaded = threads !== undefined;
		const agent = threads?.agent ?? ctx.agent;
		const key: ThreadKey | undefined =
			input.threadId === undefined
				? undefined
				: { threadId: `${ctx.profile.id}-${input.threadId}`, resourceId: ctx.resourceId };
		const note = languageNote(pack, ctx.languages.detect(input.question));
		const since = Date.now();
		const started = agent.stream(conversation(input, !threaded), {
			instructions,
			system: `${note === "" ? "" : `${note}\n`}${pack.prompt.passagesPreamble}\n${renderPassages(numbered)}`,
			toolsets: { knowledge: searchKnowledgeTools(search, ledger, pack.name) },
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
			crossReferences: activeCrossReferences(ctx, input.question),
			locale: input.locale,
			languages: ctx.languages,
			faithfulness: ctx.faithfulness,
		});
		const emit = async (step: GateStep): Promise<EngineEvent | undefined> => {
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
