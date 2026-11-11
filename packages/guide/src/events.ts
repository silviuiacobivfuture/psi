import { z } from "zod";
import { type Locale, LocaleSchema, type Source } from "./contract";

/**
 * Why the guide did not answer. The module ships no copy: the app renders each reason from its own
 * i18n (crisis is the fixed message with 112 and the clinic phone).
 * - `crisis`: self-harm, suicide, abuse or emergency language. Never sent to the model.
 * - `out_of_scope`: a request for a diagnosis, medication or individual treatment advice, a
 *   question the guide cannot take as asked (empty, too long, malformed), or an answer that broke a
 *   brand rule (Psizone recommending Hemi-Sync or EQ-SYNC on a clinical question).
 * - `no_content`: nothing reviewed answers the question (empty retrieval, the model found the
 *   passages do not answer it, the answer cited no passage, or it carried a figure the passages
 *   do not contain).
 * - `unavailable`: no API key, provider or knowledge failure, a timeout, an abort, or a model that
 *   did not finish its answer.
 */
export type RefusalReason = "crisis" | "out_of_scope" | "no_content" | "unavailable";

/**
 * One step of a streamed answer. A successful answer is `thinking`, `text`*, `sources`, `done`.
 * A refusal is `refusal`, `done` (preceded by `thinking` once retrieval started). A refusal may
 * follow `text` events when a check fails mid-answer: the app then replaces the partial answer with
 * the refusal. Every stream ends with exactly one `done`.
 */
export type GuideEvent =
	| { type: "thinking" }
	| { type: "text"; delta: string }
	| { type: "sources"; sources: ReadonlyArray<Source> }
	| { type: "refusal"; reason: RefusalReason }
	| { type: "done" };

export type HistoryRole = "user" | "guide";

export interface HistoryTurn {
	role: HistoryRole;
	text: string;
}

export interface AskInput {
	question: string;
	locale: Locale;
	/** Earlier turns, oldest first. Ignored when `threadId` is set and memory is configured. */
	history?: ReadonlyArray<HistoryTurn>;
	/**
	 * Set only after the visitor consented to the conversation being kept. Must be unguessable
	 * (16–128 of `A-Z a-z 0-9 _ -`, e.g. a UUID from the app's session): it is the only key to the
	 * stored thread. Without it nothing is stored.
	 */
	threadId?: string;
}

/** The longest question the guide takes, in characters (after trimming). */
export const MAX_QUESTION_LENGTH = 1000;
/** The most history turns the guide reads; older ones are dropped by the app. */
export const MAX_HISTORY_TURNS = 20;
/** The longest single history turn, in characters. */
export const MAX_HISTORY_TURN_LENGTH = 4000;

const HistoryTurnSchema: z.ZodType<HistoryTurn> = z.object({
	role: z.enum(["user", "guide"]),
	text: z.string().trim().min(1).max(MAX_HISTORY_TURN_LENGTH),
});

/** Parses what an app passes to `ask`; apps may run it first to reject input before streaming. */
export const AskInputSchema: z.ZodType<AskInput, z.ZodTypeDef, unknown> = z
	.object({
		question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
		locale: LocaleSchema,
		history: z.array(HistoryTurnSchema).max(MAX_HISTORY_TURNS).readonly().optional(),
		threadId: z
			.string()
			.regex(/^[A-Za-z0-9_-]{16,128}$/)
			.optional(),
	})
	.strict();
