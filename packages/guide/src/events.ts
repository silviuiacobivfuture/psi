import {
	askInputSchema,
	type AskInput as EngineAskInput,
	type EngineEvent,
	type HistoryRole,
	type HistoryTurn,
	MAX_HISTORY_TURN_LENGTH,
	MAX_HISTORY_TURNS,
	MAX_QUESTION_LENGTH,
	type RefusalReason,
} from "@psi/engine";
import type { z } from "zod";
import { LOCALES, type Locale } from "./contract";

/**
 * Why the guide did not answer, from the engine. The module ships no copy: the app renders each
 * reason from its own i18n, in the locale it passed to `ask` (the configured language, never the
 * visitor's detected one). For psi's guides:
 * - `crisis`: self-harm, suicide, abuse or emergency language. Never sent to the model. The app
 *   shows its fixed message with 112 and the clinic phone.
 * - `out_of_scope`: a request for a diagnosis, medication or individual treatment advice, a
 *   question the guide cannot take as asked (empty, too long, malformed), or an answer that broke
 *   a brand rule (Psizone recommending Hemi-Sync or EQ-SYNC on a clinical question).
 * - `injection`, `abuse`, `rate_limited`, `exchange_limit`, `no_content`, `unavailable`: see the
 *   engine.
 */
export type { RefusalReason };

/**
 * One step of a streamed answer. A successful answer is `thinking`, `text`*, `sources`, `done`.
 * A refusal is `refusal`, `done` (preceded by `thinking` once retrieval started). Every stream
 * ends with exactly one `done`.
 */
export type GuideEvent = EngineEvent;

export type { HistoryRole, HistoryTurn };

/** What an app passes to `ask`: the question, in one of psi's locales. */
export type AskInput = EngineAskInput<Locale>;

export { MAX_HISTORY_TURN_LENGTH, MAX_HISTORY_TURNS, MAX_QUESTION_LENGTH };

/** Parses what an app passes to `ask`; apps may run it first to reject input before streaming. */
export const AskInputSchema: z.ZodType<AskInput, z.ZodTypeDef, unknown> = askInputSchema(LOCALES);
