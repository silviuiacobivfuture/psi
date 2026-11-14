import type { AssistantSettingsType } from "@psi/scheduling-sdk/contract";
import { z } from "zod";

const StepUsage = z
	.object({
		usage: z
			.object({ inputTokens: z.number().optional(), outputTokens: z.number().optional() })
			.passthrough(),
	})
	.passthrough();

/** What the finished steps of a turn used so far, prompt and answer together (a step that says nothing counts 0). */
export function tokensSoFar(steps: ReadonlyArray<unknown>): number {
	let total = 0;
	for (const step of steps) {
		const parsed = StepUsage.safeParse(step);
		if (!parsed.success) continue;
		const { inputTokens = 0, outputTokens = 0 } = parsed.data.usage;
		total += Math.max(0, inputTokens) + Math.max(0, outputTokens);
	}
	return total;
}

/** The longest answer one model call of the turn may write: the answer length, capped by the tokens per request. */
export function outputCapOf(s: AssistantSettingsType): number {
	return Math.min(s.maxOutputTokens, s.tokens.perRequest);
}

/**
 * How one step of a turn runs: the last step allowed (the tool rounds are spent), or a turn that already used its
 * tokens per request, may only write the answer; any other step chooses freely.
 */
export function stepChoice(
	s: AssistantSettingsType,
	stepNumber: number,
	steps: ReadonlyArray<unknown>,
): { toolChoice: "none" } | undefined {
	const last = stepNumber >= s.maxToolCalls;
	return last || tokensSoFar(steps) >= s.tokens.perRequest
		? { toolChoice: "none" as const }
		: undefined;
}
