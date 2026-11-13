import type { Agent } from "@mastra/core/agent";
import { RequestContext } from "@mastra/core/request-context";
import type { Memory } from "@mastra/memory";
import { CREATIVITY_TEMPERATURE } from "../behaviour";
import { within } from "../deadline";
import type { LanguageDetector } from "../language/detect";
import { forgetAnswer } from "../memory";
import type { StaffEvent, StaffTurnInput } from "./events";
import { stripTags, withoutFence } from "./fence";
import { staffNotes } from "./prompt";
import { SESSION_KEY, type StaffSession } from "./session";
import { toolKeyOf } from "./tool-ids";

const MAX_OUTPUT_TOKENS = 2_048;
/** Tool rounds per reply, then the reply. */
const MAX_STEPS = 8;
const FIRST_CHUNK_MS = 15_000;

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
}

/** The thread a conversation lives in: the person's own namespace, never a visitor's. */
export function threadKey(sub: string, threadId: string | undefined) {
	return {
		threadId: `staff:${sub}:${threadId ?? "default"}`,
		resourceId: `staff:${sub}`,
	};
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
	try {
		const other = args.detector.isOther(input.message, session.copy.locale)
			? args.detector.detect(input.message)
			: undefined;
		const output = await within(
			agent.stream([{ role: "user", content: input.message }], {
				instructions: args.instructions,
				system: staffNotes({
					copy: session.copy,
					principal: session.principal,
					page: input.page ?? session.page,
					timeZone: session.timeZone,
					now: session.now(),
					otherLanguage: other,
				}),
				requestContext: new RequestContext<unknown>([[SESSION_KEY, session]]),
				maxSteps: MAX_STEPS,
				maxProcessorRetries: 0,
				abortSignal: controller.signal,
				modelSettings: {
					maxRetries: 0,
					maxOutputTokens: MAX_OUTPUT_TOKENS,
					temperature: CREATIVITY_TEMPERATURE.precise,
				},
				memory: { thread: key.threadId, resource: key.resourceId },
			}),
			Math.min(timeouts.idleMs, FIRST_CHUNK_MS),
			"model start",
			controller.signal,
		);
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
						yield {
							type: "tool",
							callId: chunk.payload.toolCallId,
							tool,
							phase: refused ? "refused" : "done",
							label: session.copy.chip(toolKey, refused ? "refused" : "done"),
						};
					}
					for (const card of session.cards.splice(0)) {
						produced = true;
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
		if (finish !== "stop") throw new Error(`finished with reason ${finish ?? "none"}`);
		// A held-back partial tag that never completed is plain text after all.
		const whole = stripTags(raw).trimStart();
		if (whole.length > shown.length && whole.startsWith(shown)) {
			yield { type: "text", delta: whole.slice(shown.length) };
			shown = whole;
		}
		if (shown.trim() === "") throw new Error("empty reply");
		// Never wrong silently: a reply that says a change is waiting for confirmation, when no card was made, is corrected.
		if (proposed === 0 && session.copy.claimsPrepared.test(shown)) {
			shown = session.copy.unbackedClaim;
			yield { type: "replace", text: shown };
		}
	} catch (error) {
		failed = true;
		const aborted = args.signal?.aborted === true;
		if (!aborted) args.onFailure("model", error);
		if (!aborted && !produced && args.retried !== true) retry = true;
		else {
			for (const card of session.cards.splice(0)) yield { type: "card", card };
			if (!aborted) yield { type: "refusal", reason: "unavailable" };
		}
	} finally {
		clearTimeout(total);
		args.signal?.removeEventListener("abort", onAbort);
		if (failed) void forgetAnswer(args.memory, key, started, Promise.all(settled));
	}
	if (retry) {
		yield* runTurn({ ...args, retried: true });
		return;
	}
	yield { type: "done" };
}
