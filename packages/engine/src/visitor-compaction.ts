import type { AssistantSettingsType } from "@psi/scheduling-sdk/contract";
import { type AskContext, report } from "./ask-context";
import { compactThread } from "./compaction";
import type { AskInput } from "./events";
import type { ModelUsage } from "./usage";

/** The words the summary is introduced with to the model, in the conversation's language. */
const HEADING: Readonly<Record<string, string>> = {
	ro: "Rezumatul conversației de până acum:",
	en: "Summary of the conversation so far:",
};

/** What folding the kept conversation gave this turn: the summary to read back, and what writing it used. */
export interface Folded {
	note?: string;
	usage?: ModelUsage;
}

/**
 * On a governed site, a kept conversation (the visitor consented to memory: `threadId`) longer than the organisation's
 * `memory.compactAfter` has its older part folded into one summary by `model.summary` before the reply, and the summary
 * goes to the model with the turn's notes (it is dated as the oldest message, outside the window of recent ones read
 * back). Below the window nothing is asked of a model. A conversation that is not kept is the page's own: nothing to
 * fold. A failure leaves the conversation whole, is reported, and the turn goes on.
 */
export async function foldConversation(
	ctx: AskContext,
	input: AskInput,
	settings: AssistantSettingsType,
	signal: AbortSignal,
): Promise<Folded> {
	if (ctx.summarise === undefined || ctx.threadAgent === undefined || input.threadId === undefined)
		return {};
	try {
		const outcome = await compactThread({
			memory: ctx.threadAgent().memory,
			key: { threadId: `${ctx.profile.id}-${input.threadId}`, resourceId: ctx.resourceId },
			settings,
			summarise: ctx.summarise,
			heading: HEADING[input.locale] ?? HEADING.en ?? "",
			signal,
		});
		return {
			...(outcome.summary === undefined ? {} : { note: outcome.summary }),
			...(outcome.kind === "compacted" ? { usage: outcome.usage } : {}),
		};
	} catch (error) {
		report(ctx, "compaction", error);
		return {};
	}
}
