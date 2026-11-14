import type { Agent } from "@mastra/core/agent";
import { RequestContext } from "@mastra/core/request-context";
import type { Memory } from "@mastra/memory";
import { z } from "zod";
import { MODEL_KEY } from "../agent";
import { within } from "../deadline";
import type { LanguageDetector } from "../language/detect";
import { forgetAnswer } from "../memory";
import { usageOf as modelUsageOf, USAGE_WAIT_MS, type UsageSource } from "../usage";
import { matchActions } from "./actions";
import { modelKeyOf, type StaffUsage, skillsFor, toolAllowance } from "./assistant-config";
import type { StaffCard, StaffEvent, StaffTurnInput } from "./events";
import { stripTags, withoutFence } from "./fence";
import { staffNotes } from "./prompt";
import { finishedShort, isEmptyCard, withoutUnbackedClaims } from "./reply-guards";
import { SESSION_KEY, type StaffSession } from "./session";
import { outputCapOf, stepChoice } from "./step-budget";
import { toolKeyOf } from "./tool-ids";

const FIRST_CHUNK_MS = 15_000;

/**
 * The provider caches everything up to here: the standing instructions (the organisation's version of them, its skills)
 * are the same across its turns, so they are marked as the prompt's cache breakpoint; the per-turn notes come after.
 */
export const CACHE_BREAKPOINT = { openrouter: { cacheControl: { type: "ephemeral" as const } } };

/** What a finished stream used, as the staff meters take it. */
async function usageOf(output: UsageSource, signal: AbortSignal): Promise<StaffUsage> {
	return { ...(await modelUsageOf(output, signal)), limitHit: false };
}

export interface TurnTimeouts {
	idleMs: number;
	totalMs: number;
}

export interface TurnArgs {
	agent: Agent;
	session: StaffSession;
	input: StaffTurnInput;
	instructions: string;
	memory: Memory;
	detector: LanguageDetector;
	timeouts: TurnTimeouts;
	signal: AbortSignal | undefined;
	onFailure: (stage: string, error: unknown) => void;
	/** Set on the one automatic retry after a provider failure that came before any output. */
	retried?: boolean;
	/** Told what the turn used (tokens, cost) before it ends; awaited, never failing the turn. */
	onUsage?: (usage: StaffUsage) => Promise<void>;
	/** The conversation's summary of its folded older part (`memory.compactAfter`), read with the per-turn notes. */
	summary?: string;
}

/** The thread a conversation lives in: the person's own namespace, never a visitor's. */
export function threadKey(sub: string, threadId: string | undefined) {
	return {
		threadId: `staff:${sub}:${threadId ?? "default"}`,
		resourceId: `staff:${sub}`,
	};
}

const ResultShape = z
	.object({
		status: z.string().optional(),
		clients: z.array(z.unknown()).optional(),
		actions: z.array(z.unknown()).optional(),
	})
	.passthrough();

/** How many things a search found, read from the tool's own answer: 0 for "none", undefined when the answer is not a search. */
function foundCount(result: unknown): number | undefined {
	const shape = ResultShape.safeParse(result);
	if (!shape.success) return undefined;
	if (shape.data.status === "none") return 0;
	return (shape.data.clients ?? shape.data.actions)?.length;
}

function wasRefused(result: unknown): boolean {
	return (
		typeof result === "object" &&
		result !== null &&
		"status" in result &&
		result.status === "refused"
	);
}

/**
 * One streamed turn. The text goes out as the model writes it; a tool call resets any preamble,
 * shows its chip and, once the tool returned, the cards it produced (built from the tool's data,
 * not from the model's words). A failed turn ends in a refusal and its answer is removed from the
 * thread. Every stream ends with exactly one `done`.
 */
export async function* runTurn(args: TurnArgs): AsyncGenerator<StaffEvent, void, undefined> {
	const { agent, session, input, timeouts } = args;
	const key = threadKey(session.principal.sub, input.threadId);
	const started = Date.now();
	const settled: Array<Promise<unknown>> = [];
	const controller = new AbortController();
	const onAbort = (): void => controller.abort();
	args.signal?.addEventListener("abort", onAbort, { once: true });
	const total = setTimeout(() => controller.abort(), timeouts.totalMs);
	yield { type: "thinking" };
	let shown = "";
	let raw = "";
	let failed = false;
	let retry = false;
	let produced = false;
	let proposed = 0;
	/** Cards with nothing in them wait for the end: shown once, and not at all when the words say it. */
	const emptyCards: Array<StaffCard> = [];
	const settings = session.config.settings;
	/** Tool rounds, then one last step that may only write the reply. */
	const steps = settings.maxToolCalls + 1;
	let streamed:
		| { totalUsage: PromiseLike<unknown>; providerMetadata: PromiseLike<unknown> }
		| undefined;
	try {
		const other = args.detector.isOther(input.message, session.copy.locale)
			? args.detector.detect(input.message)
			: undefined;
		session.allow = toolAllowance(skillsFor(session.config.skills, input.message));
		const output = await within(
			agent.stream([{ role: "user", content: input.message }], {
				instructions: {
					role: "system",
					content: args.instructions,
					providerOptions: CACHE_BREAKPOINT,
				},
				system: [
					staffNotes({
						copy: session.copy,
						principal: session.principal,
						page: input.page ?? session.page,
						timeZone: session.timeZone,
						now: session.now(),
						otherLanguage: other,
					}),
					...(args.summary === undefined ? [] : [args.summary]),
				].join("\n\n"),
				requestContext: new RequestContext<unknown>([
					[SESSION_KEY, session],
					[MODEL_KEY, modelKeyOf(settings)],
				]),
				maxSteps: steps,
				// The last step has no tools, nor does one after the turn used its tokens per request: the turn ends in
				// words, never in one more call.
				prepareStep: ({ stepNumber, steps: done }) => stepChoice(settings, stepNumber, done),
				maxProcessorRetries: 0,
				abortSignal: controller.signal,
				modelSettings: {
					maxRetries: 0,
					maxOutputTokens: outputCapOf(settings),
					temperature: settings.temperature,
				},
				memory: {
					thread: key.threadId,
					resource: key.resourceId,
					options: { lastMessages: settings.memory.historyMessages },
				},
			}),
			Math.min(timeouts.idleMs, FIRST_CHUNK_MS),
			"model start",
			controller.signal,
		);
		streamed = output;
		// The figures are read at the end, or never (a retried attempt): a failed stream must not leave them unhandled.
		Promise.resolve(output.totalUsage).catch(() => undefined);
		Promise.resolve(output.providerMetadata).catch(() => undefined);
		settled.push(output.finishReason.catch(() => undefined));
		const reader = output.fullStream.getReader();
		const names = new Map<string, string>();
		let finish: string | undefined;
		try {
			for (;;) {
				const next = await within(
					reader.read(),
					timeouts.idleMs,
					"model stream",
					controller.signal,
				);
				if (next.done) break;
				const chunk = next.value;
				if (chunk.type === "text-delta") {
					raw += chunk.payload.text;
					const clean = withoutFence(raw).trimStart();
					const delta = clean.slice(shown.length);
					if (delta !== "") {
						produced = true;
						shown = clean;
						yield { type: "text", delta };
					}
				} else if (chunk.type === "tool-call") {
					const key = toolKeyOf(chunk.payload.toolName);
					names.set(chunk.payload.toolCallId, chunk.payload.toolName);
					produced = true;
					raw = "";
					if (shown !== "") {
						shown = "";
						yield { type: "replace", text: "" };
					}
					if (key !== undefined) {
						yield {
							type: "tool",
							callId: chunk.payload.toolCallId,
							tool: chunk.payload.toolName,
							phase: "running",
							label: session.copy.chip(key, "running"),
						};
					}
				} else if (chunk.type === "tool-result") {
					const tool = names.get(chunk.payload.toolCallId) ?? chunk.payload.toolName;
					const toolKey = toolKeyOf(tool);
					const refused = wasRefused(chunk.payload.result);
					if (toolKey !== undefined) {
						const found = refused ? undefined : foundCount(chunk.payload.result);
						yield {
							type: "tool",
							callId: chunk.payload.toolCallId,
							tool,
							phase: refused ? "refused" : "done",
							label:
								(found === undefined ? undefined : session.copy.chipFound(toolKey, found)) ??
								session.copy.chip(toolKey, refused ? "refused" : "done"),
						};
					}
					for (const card of session.cards.splice(0)) {
						produced = true;
						if (isEmptyCard(card)) {
							if (emptyCards.length === 0) emptyCards.push(card);
							continue;
						}
						if (card.kind === "proposal") proposed += 1;
						yield { type: "card", card };
					}
				} else if (chunk.type === "error" || chunk.type === "abort" || chunk.type === "tripwire") {
					throw new Error(chunk.type);
				} else if (chunk.type === "finish") {
					finish = chunk.payload.stepResult.reason;
				}
			}
		} finally {
			reader.cancel().catch(() => undefined);
		}
		// A held-back partial tag that never completed is plain text after all.
		const whole = stripTags(raw).trimStart();
		if (whole.length > shown.length && whole.startsWith(shown)) {
			yield { type: "text", delta: whole.slice(shown.length) };
			shown = whole;
		}
		const replace = function* (text: string): Generator<StaffEvent, void, undefined> {
			shown = text;
			yield { type: "replace", text };
		};
		if (finish !== "stop") {
			// Out of tokens or steps, or the stream just ended: an answer that stopped is said to have
			// stopped, never passed off as whole; nothing at all from a model that never answered is a failure.
			if (shown.trim() === "" && !produced)
				throw new Error(`finished with reason ${finish ?? "none"}`);
			args.onFailure("truncated", new Error(`finished with reason ${finish ?? "none"}`));
			if (shown.trim() !== "") yield* replace(finishedShort(session.copy, shown));
		}
		proposed += session.reused.count;
		if (shown.trim() === "") {
			if (!produced) throw new Error("empty reply");
			yield* replace(proposed > 0 ? session.copy.reviewCard : session.copy.stoppedShort);
		}
		// Never wrong silently: a sentence that says a change is waiting for confirmation, when no card was made, is taken out.
		if (proposed === 0) {
			const checked = withoutUnbackedClaims(session.copy, shown);
			if (checked.claimed) {
				yield* replace(`${checked.text} ${session.copy.unbackedClaim}`.trim());
			}
		}
		// "I have no tool for that" while the person's own registry has one: said so instead.
		if (proposed === 0 && session.copy.deniesAbility.test(shown)) {
			const listed = await session.port.listActions(input.page ?? session.page);
			const found = listed.ok ? matchActions(listed.value, input.message).slice(0, 3) : [];
			if (found.length > 0) yield* replace(session.copy.actionsExist(found.map((a) => a.label)));
		}
		// One empty result card at most, and only when the words do not already say it.
		const [empty] = emptyCards;
		if (empty !== undefined && !session.copy.saysNothing.test(shown))
			yield { type: "card", card: empty };
	} catch (error) {
		failed = true;
		const aborted = args.signal?.aborted === true;
		if (!aborted) args.onFailure("model", error);
		if (!aborted && shown.trim() !== "") {
			// The stream broke after words: they are kept, and marked as stopped, not passed off as whole.
			yield { type: "replace", text: finishedShort(session.copy, shown) };
			for (const card of session.cards.splice(0)) yield { type: "card", card };
		} else if (!aborted && !produced && args.retried !== true) retry = true;
		else {
			for (const card of session.cards.splice(0)) yield { type: "card", card };
			if (!aborted) yield { type: "refusal", reason: "unavailable" };
		}
	} finally {
		clearTimeout(total);
		args.signal?.removeEventListener("abort", onAbort);
		if (failed) void forgetAnswer(args.memory, key, started, Promise.all(settled));
	}
	// What the attempt used is counted even when it failed: the provider may have charged for it.
	// A retry before any output is the same turn: it is recorded once, by the attempt that answers.
	if (streamed !== undefined && args.onUsage !== undefined && !retry) {
		try {
			await args.onUsage(await usageOf(streamed, AbortSignal.timeout(USAGE_WAIT_MS * 2)));
		} catch (error) {
			args.onFailure("usage", error);
		}
	}
	if (retry) {
		yield* runTurn({ ...args, retried: true });
		return;
	}
	yield { type: "done" };
}
