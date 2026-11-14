import { z } from "zod";
import { within } from "./deadline";

/** How long the end of a model call waits for the provider's usage figures before taking what it has. */
export const USAGE_WAIT_MS = 2_000;

/** What one model call (its every step) used: tokens, the cached part of the prompt, and its cost in micro-dollars. */
export interface ModelUsage {
	inputTokens: number;
	outputTokens: number;
	cachedTokens: number;
	costMicroUsd: number;
}

export const NO_MODEL_USAGE: ModelUsage = {
	inputTokens: 0,
	outputTokens: 0,
	cachedTokens: 0,
	costMicroUsd: 0,
};

/** A count the provider reports either as a number or as `{ total }` (the AI SDK's v3 usage, under `raw`). */
const Tokens = z.union([z.number(), z.object({ total: z.number().optional() }).passthrough()]);
const tokens = (t: z.infer<typeof Tokens> | undefined): number | undefined =>
	typeof t === "number" ? t : t?.total;

/**
 * Mastra's totals: `inputTokens`/`outputTokens` at the top, or (a provider on the v3 usage shape) only under `raw`
 * as `{ total }`.
 */
const UsageShape = z
	.object({
		inputTokens: z.number().optional(),
		outputTokens: z.number().optional(),
		cachedInputTokens: z.number().optional(),
		raw: z
			.object({ inputTokens: Tokens.optional(), outputTokens: Tokens.optional() })
			.passthrough()
			.optional(),
	})
	.passthrough();
type Usage = z.infer<typeof UsageShape>;
const inputOf = (u: Usage): number | undefined => u.inputTokens ?? tokens(u.raw?.inputTokens);
const outputOf = (u: Usage): number | undefined => u.outputTokens ?? tokens(u.raw?.outputTokens);
const CostShape = z
	.object({
		openrouter: z
			.object({ usage: z.object({ cost: z.number().optional() }).passthrough() })
			.passthrough(),
	})
	.passthrough();
const whole = (n: number | undefined): number =>
	n === undefined || !Number.isFinite(n) ? 0 : Math.max(0, Math.round(n));

/** A finished (or failed) stream's totals, as Mastra hands them over. */
export interface UsageSource {
	totalUsage: PromiseLike<unknown>;
	providerMetadata: PromiseLike<unknown>;
}

/** What a stream used, read from Mastra's totals and OpenRouter's accounting (dollars to micro-dollars). */
export async function usageOf(output: UsageSource, signal: AbortSignal): Promise<ModelUsage> {
	const [used, meta] = await Promise.all([
		within(Promise.resolve(output.totalUsage), USAGE_WAIT_MS, "usage", signal).catch(
			() => undefined,
		),
		within(Promise.resolve(output.providerMetadata), USAGE_WAIT_MS, "usage", signal).catch(
			() => undefined,
		),
	]);
	const u = UsageShape.safeParse(used);
	const c = CostShape.safeParse(meta);
	return {
		inputTokens: whole(u.success ? inputOf(u.data) : undefined),
		outputTokens: whole(u.success ? outputOf(u.data) : undefined),
		cachedTokens: whole(u.success ? u.data.cachedInputTokens : undefined),
		costMicroUsd: whole(
			c.success && c.data.openrouter.usage.cost !== undefined
				? c.data.openrouter.usage.cost * 1_000_000
				: undefined,
		),
	};
}

const StepUsage = z.object({ usage: UsageShape }).passthrough();

/** The tokens (prompt and answer) the finished steps of one call used so far, read from Mastra's step results. */
export function stepTokens(steps: ReadonlyArray<unknown>): number {
	let total = 0;
	for (const step of steps) {
		const s = StepUsage.safeParse(step);
		if (s.success) total += whole(inputOf(s.data.usage)) + whole(outputOf(s.data.usage));
	}
	return total;
}
