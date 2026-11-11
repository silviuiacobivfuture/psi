import { z } from "zod";
import { type AskContext, type AskControl, report } from "./ask-context";
import { within } from "./deadline";
import type { AskInput, RefusalReason } from "./events";
import { CRISIS_SCAN_LIMIT } from "./profile";
import { matchesRules } from "./rules";
import { screenInput } from "./screening/chain";
import { RateDecisionSchema } from "./screening/rate-limit";
import { cleanText } from "./screening/unicode";

const ClientIdSchema = z.string().trim().min(1).max(256).optional();

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
 * The guardrails that need no model, before anything leaves the process: crisis (on the raw and
 * the cleaned text, so invisible characters cannot hide it), the rate limit, validation, the
 * deterministic chain (`screenInput`) and scope.
 */
export async function screen(
	ctx: AskContext,
	raw: unknown,
	control: AskControl | undefined,
): Promise<{ input: AskInput } | { reason: RefusalReason }> {
	const invalidInput = ctx.profile.refusalPolicy?.invalidInput ?? "out_of_scope";
	const question = rawQuestion(raw);
	if (question !== undefined && (isCrisis(ctx, question) || isCrisis(ctx, cleanText(question)))) {
		return { reason: "crisis" };
	}
	const limited = await rateLimit(ctx, control);
	if (limited !== undefined) return { reason: limited };
	const parsed = ctx.inputSchema.safeParse(raw);
	if (!parsed.success) return { reason: invalidInput };
	let screened: Awaited<ReturnType<typeof screenInput>>;
	try {
		screened = await screenInput(ctx.screening, parsed.data, invalidInput);
	} catch (error) {
		report(ctx, "screening", error);
		return { reason: "unavailable" };
	}
	if ("reason" in screened) return screened;
	if (matchesRules(screened.input.question, ctx.profile.outOfScope ?? [])) {
		return { reason: "out_of_scope" };
	}
	return screened;
}
