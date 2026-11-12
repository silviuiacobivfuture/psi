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

/**
 * A next step the visitor can take with one click. `ask` sends `text` into the conversation as the
 * visitor's own message (the booking dialogue on a site that schedules); `link` opens `href`
 * (a page, or another psi site's chat with the booking started).
 */
export type GuideAction =
	| { kind: "ask"; label: string; text: string }
	| { kind: "link"; label: string; href: string };

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
	/**
	 * Next steps shown as buttons under the reply: a service the reply names (booking, a sign-up,
	 * a page) or the handoff to another site's booking. The app labels nothing: each carries its
	 * own words, in the asked locale.
	 */
	| { type: "actions"; actions: ReadonlyArray<GuideAction> }
	| { type: "refusal"; reason: RefusalReason }
	/** Free times to book, offered in the conversation; the app renders its own confirm step. */
	| { type: "booking"; offer: BookingOffer }
	| { type: "done" };

export type HistoryRole = "user" | "guide";

export interface HistoryTurn {
	role: HistoryRole;
	text: string;
	/** The title of the page the visitor was on when this turn was asked or answered. */
	page?: string;
}

/** What a page is: an article of the blog, a hub, a method, or any other page of a site. */
export const PAGE_KINDS = ["article", "hub", "method", "page"] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

/** Where a page's text stands: published, a draft, or a title waiting for its clinical review. */
export const PAGE_STATUSES = ["published", "draft", "in-review"] as const;
export type PageStatus = (typeof PAGE_STATUSES)[number];

/** The longest each part of a page's context may be, in characters (and sections). */
export const PAGE_LIMITS = {
	title: 200,
	url: 300,
	lead: 700,
	heading: 160,
	headings: 30,
	excerpt: 2_600,
} as const;

/**
 * The page the visitor is reading, as the APP's server resolved it from its own content (never
 * text the browser sent). `excerpt` is the text the model may state as fact; it exists only for
 * a `published` page (the schema drops it for any other status). A draft or an in-review page
 * carries its title, its lead and its headings only.
 */
export interface PageContext {
	kind: PageKind;
	status: PageStatus;
	title: string;
	/** Where the page lives: a site-relative path or an absolute http(s) address. */
	url: string;
	lead?: string;
	headings: ReadonlyArray<string>;
	excerpt?: string;
	/**
	 * Whether the page's text is health content (a clinician reviews it). Absent means it is: the
	 * guide then says a clinician is still reviewing a page that is not published; for `false` it
	 * says the text is not yet approved by the team.
	 */
	clinical?: boolean;
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
	/**
	 * The page the visitor is on, resolved by the app's server from its own content. Context for the
	 * answer, never instructions; without it the guide knows nothing of where the visitor is.
	 */
	page?: PageContext;
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
	page: z.string().trim().min(1).max(PAGE_LIMITS.title).optional(),
});

const PageUrl = z
	.string()
	.trim()
	.min(1)
	.max(PAGE_LIMITS.url)
	.refine((u) => (u.startsWith("/") && !u.startsWith("//")) || /^https?:\/\/[^\s]+$/.test(u), {
		message: "a page url is a site-relative path or an http(s) address",
	});

/**
 * The page context at the boundary. A body is kept only for a `published` page: for a draft or a
 * page in review the schema removes it, so an unreviewed text can never reach the model through
 * a caller's mistake.
 */
export const PageContextSchema: z.ZodType<PageContext, z.ZodTypeDef, unknown> = z
	.object({
		kind: z.enum(PAGE_KINDS),
		status: z.enum(PAGE_STATUSES),
		title: z.string().trim().min(1).max(PAGE_LIMITS.title),
		url: PageUrl,
		lead: z.string().trim().min(1).max(PAGE_LIMITS.lead).optional(),
		headings: z
			.array(z.string().trim().min(1).max(PAGE_LIMITS.heading))
			.max(PAGE_LIMITS.headings)
			.readonly(),
		excerpt: z.string().trim().min(1).max(PAGE_LIMITS.excerpt).optional(),
		clinical: z.boolean().optional(),
	})
	.strict()
	.transform((page): PageContext => {
		const { excerpt, ...rest } = page;
		return page.status === "published" && excerpt !== undefined ? { ...rest, excerpt } : rest;
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
		page: PageContextSchema.optional(),
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
