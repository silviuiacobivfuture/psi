import { z } from "zod";
import { type AskContext, type AskControl, report } from "./ask-context";
import { within } from "./deadline";
import type { AskInput, RefusalReason } from "./events";
import { CRISIS_SCAN_LIMIT } from "./profile";
import { matchesRules } from "./rules";
import { screenInput } from "./screening/chain";
import { RateDecisionSchema } from "./screening/rate-limit";
import { cleanText } from "./screening/unicode";
import { type RetrievalSettings, settingsForTurn } from "./settings";

const ClientIdSchema = z.string().trim().min(1).max(256).optional();
const VisitorKeysSchema = z.array(z.string().trim().min(1).max(256)).max(8).default([]);
const HOUR_MS = 3_600_000;

/** The question as sent, if any, before validation, so crisis language is never missed. */
function rawQuestion(raw: unknown): string | undefined {
	if (typeof raw !== "object" || raw === null || !("question" in raw)) return undefined;
	return typeof raw.question === "string" ? raw.question : undefined;
}

/** True when the profile's crisis rules match the text, scanned up to the policy's limit. */
function isCrisis(ctx: AskContext, text: string): boolean {
	const crisis = ctx.profile.crisis ?? [];
	const limit = ctx.profile.refusalPolicy?.crisisScanLimit ?? CRISIS_SCAN_LIMIT;
	return matchesRules(text.slice(0, limit), crisis);
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
 * Counts one exchange on every visitor key (each on its own, so all are counted even when one is
 * over), with the settings' limit and window. Over on any key refuses; the limiter failing refuses
 * (fails closed).
 */
async function exchangeLimit(
	ctx: AskContext,
	control: AskControl | undefined,
	settings: RetrievalSettings,
): Promise<RefusalReason | undefined> {
	try {
		const keys = VisitorKeysSchema.parse(control?.visitorKeys);
		if (keys.length === 0) return undefined;
		const policy = {
			limit: settings.exchangeLimit,
			windowMs: Math.round(settings.exchangeWindowHours * HOUR_MS),
		};
		const decisions = await within(
			Promise.all(
				keys.map((key) => Promise.resolve().then(() => ctx.exchangeLimiter.take(key, policy))),
			),
			ctx.timeouts.screeningMs,
			"exchange limiter",
		);
		return decisions.every((d) => RateDecisionSchema.parse(d)) ? undefined : "exchange_limit";
	} catch (error) {
		report(ctx, "rate_limit", error);
		return "unavailable";
	}
}

/** The numbers a profile publishes as its own facts (its phones), which its replies may repeat. */
function publishedNumbers(ctx: AskContext, locale: string): ReadonlyArray<string> {
	const facts = ctx.profile.locales[locale]?.facts ?? [];
	return [...new Set(facts.flatMap((f) => f.match(/\d[\d ]{6,}\d/g) ?? []))];
}

/**
 * The guardrails that need no model, before anything leaves the process: crisis (on the raw and
 * the cleaned text, so invisible characters cannot hide it, and never limited), the runtime
 * settings (a switched-off guide is `unavailable`), the rate limit, the exchange limit,
 * validation and the deterministic chain (`screenInput`). Scope is not refused here: an
 * out-of-scope question is marked, and the agent steers it towards a specialist in conversation.
 */
export async function screen(
	ctx: AskContext,
	raw: unknown,
	control: AskControl | undefined,
): Promise<
	{ input: AskInput; settings: RetrievalSettings; outOfScope: boolean } | { reason: RefusalReason }
> {
	const invalidInput = ctx.profile.refusalPolicy?.invalidInput ?? "out_of_scope";
	const question = rawQuestion(raw);
	if (question !== undefined && (isCrisis(ctx, question) || isCrisis(ctx, cleanText(question)))) {
		return { reason: "crisis" };
	}
	const settings = settingsForTurn(await ctx.settings.current(), control?.settings);
	if (!settings.guideEnabled) {
		report(ctx, "disabled", new Error("the guide is switched off (guideEnabled: false)"));
		return { reason: "unavailable" };
	}
	const limited = (await rateLimit(ctx, control)) ?? (await exchangeLimit(ctx, control, settings));
	if (limited !== undefined) return { reason: limited };
	const parsed = ctx.inputSchema.safeParse(raw);
	if (!parsed.success) return { reason: invalidInput };
	let screened: Awaited<ReturnType<typeof screenInput>>;
	try {
		screened = await screenInput(
			ctx.screening,
			parsed.data,
			invalidInput,
			publishedNumbers(ctx, parsed.data.locale),
		);
	} catch (error) {
		report(ctx, "screening", error);
		return { reason: "unavailable" };
	}
	if ("reason" in screened) return screened;
	// Out of scope (a diagnosis, a medication): no refusal card, a gentle redirect in conversation.
	const outOfScope = matchesRules(screened.input.question, ctx.profile.outOfScope ?? []);
	return { input: screened.input, settings, outOfScope };
}
