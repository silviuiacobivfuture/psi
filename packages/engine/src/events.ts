import { z } from "zod";
import type { BookingOffer } from "./booking";
import { type BookingState, BookingStateSchema } from "./booking-state";
import type { Source } from "./contract";

/**
 * Why the engine did not answer. The engine ships no copy: the app renders each reason from its
 * own i18n, in the locale it passed to `ask`.
 * - `crisis`: the profile's crisis rules matched. Never sent to a model.
 * - `out_of_scope`: the input could not be taken as asked (its refusal policy: empty, over-long,
 *   malformed). A question outside the profile's scope is NOT refused: the agent steers it in
 *   conversation.
 * - `injection`: the question tries to change, reveal or replace the instructions (the language
 *   packs' rules, or Mastra's `PromptInjectionDetector` at the strict level).
 * - `abuse`: the question harasses, insults or threatens (the language packs' rules, unless the
 *   profile exempts it, or Mastra's `ModerationProcessor` at the strict level).
 * - `rate_limited`: the app's client asked too many questions too fast.
 * - `exchange_limit`: the visitor used up the exchanges the settings allow per window (any one of
 *   their keys: session, browser, fingerprint). Distinct from `rate_limited`, which is a burst.
 * - `no_content`: only for a profile without canned lines, when a reply could not be kept.
 *   Conversation never ends in it.
 * - `unavailable`: no API key, the switched-off guide, a limiter failure, or the model provider
 *   failing twice (network, 5xx, a timeout, an unfinished reply). Never a language mismatch,
 *   never an aborted turn (that ends with `done` alone).
 */
/** What the guide is busy with, while it works (see the `thinking` event). */
export type ThinkingStage = "searching" | "checking";

export type RefusalReason =
	| "crisis"
	| "out_of_scope"
	| "injection"
	| "abuse"
	| "rate_limited"
	| "exchange_limit"
	| "no_content"
	| "unavailable";

export const REFUSAL_REASONS = [
	"crisis",
	"out_of_scope",
	"injection",
	"abuse",
	"rate_limited",
	"exchange_limit",
	"no_content",
	"unavailable",
] as const satisfies ReadonlyArray<RefusalReason>;

export const RefusalReasonSchema: z.ZodType<RefusalReason> = z.enum(REFUSAL_REASONS);

/**
 * One step of a streamed answer. A reply is `thinking`, `text`*, then `sources` when it cites,
 * then `done`; the text streams as the model writes it. When the finished reply fails a check
 * (language, an unsupported fact, a repeat, a grammar slip) a `replace` follows: it resets the
 * text, to "" before the regenerated reply streams in, or to the corrected full text. A refusal is `refusal`, `done` (preceded by `thinking` once the model was asked). An
 * aborted turn (the visitor sent a newer question) is `thinking`, `done`: it renders nothing.
 * Every stream ends with exactly one `done`.
 */
export type EngineEvent =
	/**
	 * The guide is working. `stage` (optional, additive) says on what, so the app can say so:
	 * `searching` while a tool looks something up, `checking` while a reply is regenerated.
	 */
	| { type: "thinking"; stage?: ThinkingStage }
	| { type: "text"; delta: string }
	/**
	 * Resets the reply's text to `text` (empty before a regenerated reply streams in, or the
	 * corrected full text when a sentence was left out); later `text` events append to it.
	 */
	| { type: "replace"; text: string }
	| { type: "sources"; sources: ReadonlyArray<Source> }
	| { type: "refusal"; reason: RefusalReason }
	/** Free times to book, offered in the conversation; the app renders its own confirm step. */
	| { type: "booking"; offer: BookingOffer }
	| { type: "done" };

export type HistoryRole = "user" | "guide";

export interface HistoryTurn {
	role: HistoryRole;
	text: string;
}

export interface AskInput<TLocale extends string = string> {
	question: string;
	locale: TLocale;
	/** Earlier turns, oldest first. Ignored when `threadId` is set and memory is configured. */
	history?: ReadonlyArray<HistoryTurn>;
	/**
	 * Set only after the visitor consented to the conversation being kept. Must be unguessable
	 * (16–128 of `A-Z a-z 0-9 _ -`, e.g. a UUID from the app's session): it is the only key to the
	 * stored thread. Without it nothing is stored.
	 */
	threadId?: string;
	/**
	 * Where the visitor's booking conversation stands: the `state` of the last `booking` event, which
	 * the page carries from turn to turn. Untrusted: a time it names is checked against the store.
	 */
	booking?: BookingState;
}

/** The longest question the engine takes, in characters (after trimming). */
export const MAX_QUESTION_LENGTH = 1000;
/** The most history turns the engine reads; older ones are dropped by the app. */
export const MAX_HISTORY_TURNS = 20;
/** The longest single history turn, in characters. */
export const MAX_HISTORY_TURN_LENGTH = 4000;

const HistoryTurnSchema: z.ZodType<HistoryTurn> = z.object({
	role: z.enum(["user", "guide"]),
	text: z.string().trim().min(1).max(MAX_HISTORY_TURN_LENGTH),
});

const BaseAskInputSchema = z
	.object({
		question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
		locale: z.string(),
		history: z.array(HistoryTurnSchema).max(MAX_HISTORY_TURNS).readonly().optional(),
		threadId: z
			.string()
			.regex(/^[A-Za-z0-9_-]{16,128}$/)
			.optional(),
		booking: BookingStateSchema.optional(),
	})
	.strict();

/**
 * The schema of what an app passes to `ask`, for one set of locales; apps may run it first to
 * reject input before streaming.
 */
export function askInputSchema<TLocale extends string>(
	locales: readonly [TLocale, ...TLocale[]],
): z.ZodType<AskInput<TLocale>, z.ZodTypeDef, unknown> {
	const known: ReadonlyArray<string> = locales;
	const isLocale = (value: string): value is TLocale => known.includes(value);
	return BaseAskInputSchema.transform((input, ctx): AskInput<TLocale> => {
		const { locale } = input;
		if (!isLocale(locale)) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["locale"], message: "unknown locale" });
			return z.NEVER;
		}
		return { ...input, locale };
	});
}
