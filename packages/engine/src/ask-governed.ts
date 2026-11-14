import { z } from "zod";
import { type AskContext, type AskControl, loggable } from "./ask-context";
import type { EngineEvent, RefusalReason } from "./events";
import { type ModelUsage, NO_MODEL_USAGE } from "./usage";
import type { Governance } from "./visitor-governance";
import { personEvents, sumUsage } from "./visitor-turn";

/**
 * What one turn on a governed site comes to for the organisation's meters: each model call's use (every attempt, a
 * retry too), and whether a limit refused it (a limit met counts as such, not as a message).
 */
export interface TurnMeter {
	usages: Array<Promise<ModelUsage>>;
	limitHit: boolean;
	governance: Governance | undefined;
}

/** The refusals that are a limit of the organisation's (per visitor, per conversation, per minute). */
export const LIMITS: ReadonlySet<RefusalReason> = new Set(["rate_limited", "exchange_limit"]);

const RawShape = z
	.object({ question: z.string().optional(), locale: z.string().optional() })
	.passthrough();

/** The locale the visitor asked in when the profile has it, else the profile's first. */
export function rawLocale(ctx: AskContext, raw: unknown): string {
	const asked = RawShape.safeParse(raw);
	const locale = asked.success ? asked.data.locale : undefined;
	const known = Object.keys(ctx.profile.locales);
	return locale !== undefined && known.includes(locale) ? locale : (known[0] ?? "");
}

/** Whose conversation it is, as the hand-over counts it: the visitor's session key, else the client. */
function conversationOf(control: AskControl | undefined): string | undefined {
	return control?.visitorKeys?.[0] ?? control?.clientId;
}

/**
 * The offer of a person in place of a refusal, once the conversation's refusals reach the organisation's
 * `handoff.afterRefusals` (`handoff.enabled`). Never for a crisis (its own line is the safest answer), never without
 * the profile's copy or a way to tell the conversation apart.
 */
export function handover(
	ctx: AskContext,
	raw: unknown,
	control: AskControl | undefined,
	governance: Governance | undefined,
	reason: RefusalReason,
): ReadonlyArray<EngineEvent> | undefined {
	if (governance === undefined || reason === "crisis") return undefined;
	const handoff = governance.settings.handoff;
	const fallback = ctx.profile.locales[rawLocale(ctx, raw)]?.fallback;
	const conversation = conversationOf(control);
	if (!handoff.enabled || fallback === undefined || conversation === undefined) return undefined;
	const count = ctx.refusals.add(`${ctx.profile.id}\u0000${conversation}`);
	return count >= handoff.afterRefusals ? personEvents(fallback, governance.settings) : undefined;
}

/** Adds the turn to the organisation's meters: its model calls' use, as a message or as a limit met. */
export async function recordTurn(ctx: AskContext, meter: TurnMeter): Promise<void> {
	if (ctx.governance === undefined) return;
	const used = sumUsage(
		await Promise.all(meter.usages.map((u) => u.catch((): ModelUsage => NO_MODEL_USAGE))),
	);
	await ctx.governance.record({
		...used,
		messages: meter.limitHit ? 0 : 1,
		limitHits: meter.limitHit ? 1 : 0,
	});
}

/** The finished turn's question and answer, to the app's log, when the organisation keeps transcripts. */
export function transcribe(ctx: AskContext, raw: unknown, answer: string): void {
	if (ctx.governance === undefined || !ctx.logging.keepTranscripts) return;
	const asked = RawShape.safeParse(raw);
	const question = asked.success ? (asked.data.question ?? "") : "";
	try {
		ctx.onTranscript?.({
			profile: ctx.profile.id,
			locale: rawLocale(ctx, raw),
			question: loggable(ctx, question),
			answer: loggable(ctx, answer),
		});
	} catch {
		// A failing log hook must not change the answer.
	}
}
