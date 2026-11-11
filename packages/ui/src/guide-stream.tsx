/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { Guide, Locale, RefusalReason, Source } from "@psi/guide";
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import {
	ANSWER_TARGETS,
	type AnswerTarget,
	GuideAnswer,
	type GuideLabels,
	type GuidePhase,
} from "./components/guide-answer";

/** The longest question an asking field takes, in characters (after trimming). */
export const MAX_ASK_LENGTH = 500;

/** What Datastar posts: the page's signals. Only the asking fields matter; the rest is dropped. */
export interface AskSignals {
	question?: string;
	compassQuery?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): value is string | undefined {
	return value === undefined || typeof value === "string";
}

/**
 * Parses the posted body (the request boundary). A body that is not an object, or an asking field
 * that is not a string, is rejected (`null`).
 */
export function parseAskSignals(body: unknown): AskSignals | null {
	if (!isRecord(body)) return null;
	const { question, compassQuery } = body;
	if (!optionalString(question) || !optionalString(compassQuery)) return null;
	return { question, compassQuery };
}

/** Parses the `target` query parameter; anything unknown is the page's own answer region. */
export function parseAnswerTarget(value: unknown): AnswerTarget {
	return ANSWER_TARGETS.find((t) => t === value) ?? "guide-answer";
}

/** Picks the question from the field that asked: trimmed, 1–500 characters, or `null`. */
export function questionFor(target: AnswerTarget, signals: AskSignals): string | null {
	const raw = target === "compass-answer" ? signals.compassQuery : signals.question;
	const question = raw?.trim() ?? "";
	return question.length >= 1 && question.length <= MAX_ASK_LENGTH ? question : null;
}

export interface GuideAnswerRequest {
	guide: Guide;
	locale: Locale;
	question: string;
	target: AnswerTarget;
	labels: GuideLabels;
	/** The answer region's layout classes (see `GuideAnswer`). */
	class?: string;
}

/**
 * Streams the guide's answer as Datastar `datastar-patch-elements` events: thinking, the text as it
 * arrives, then the cited sources — or a refusal, which replaces whatever was written so far.
 * Closing the connection aborts the model call.
 */
export function streamGuideAnswer(
	c: Context,
	{ guide, locale, question, target, labels, class: className }: GuideAnswerRequest,
): Response {
	return streamSSE(c, async (stream) => {
		const patch = async (phase: GuidePhase): Promise<void> => {
			const html = (
				await (
					<GuideAnswer
						labels={labels}
						question={question}
						phase={phase}
						target={target}
						class={className}
					/>
				).toString()
			).replace(/\n/g, " ");
			await stream.writeSSE({ event: "datastar-patch-elements", data: `elements ${html}` });
		};
		const abort = new AbortController();
		stream.onAbort(() => abort.abort());
		let text = "";
		let sources: ReadonlyArray<Source> = [];
		let refused: RefusalReason | null = null;
		await patch({ kind: "thinking" });
		for await (const event of guide.ask({ question, locale }, { signal: abort.signal })) {
			switch (event.type) {
				case "thinking":
					break;
				case "text":
					text += event.delta;
					await patch({ kind: "writing", text });
					break;
				case "sources":
					sources = event.sources;
					break;
				case "refusal":
					refused = event.reason;
					await patch({ kind: "refused", reason: event.reason });
					break;
				case "done":
					if (refused === null) await patch({ kind: "done", text, sources });
					break;
			}
		}
	});
}
