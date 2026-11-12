import { z } from "zod";

/** One tool call of a turn: which tool, how long it ran, how many passages it returned. */
export interface ToolTiming {
	tool: string;
	ms: number;
	passages: number;
}

/** One model call of a turn (a first try, or the regeneration after a check). */
export interface AttemptTiming {
	/** From the call to the provider's first chunk (a token, a tool call, an error); -1: none. */
	firstChunkMs: number;
	/** From the call to its first visible text, or null when it wrote none. */
	firstTextMs: number | null;
	/** Model rounds (steps): one, plus one per round of tool calls. */
	rounds: number;
	/** The whole call. */
	ms: number;
}

/**
 * Where one turn's time went, for the app's debug log: counts and milliseconds only, never the
 * question, the passages or the reply. Every time is from the start of the turn unless named.
 */
export interface EngineTiming {
	profile: string;
	/** The deterministic screen, the settings and the limits. */
	screenMs: number;
	/** The first `text` event the visitor got, or null when none (a refusal, a booking). */
	firstTextMs: number | null;
	totalMs: number;
	attempts: ReadonlyArray<AttemptTiming>;
	tools: ReadonlyArray<ToolTiming>;
	/** How the turn ended: reply, refusal:<reason>, booking, aborted, canned. */
	outcome: string;
}

export const EngineTimingSchema: z.ZodType<EngineTiming> = z.object({
	profile: z.string(),
	screenMs: z.number(),
	firstTextMs: z.number().nullable(),
	totalMs: z.number(),
	attempts: z
		.array(
			z.object({
				firstChunkMs: z.number(),
				firstTextMs: z.number().nullable(),
				rounds: z.number().int(),
				ms: z.number(),
			}),
		)
		.readonly(),
	tools: z
		.array(z.object({ tool: z.string(), ms: z.number(), passages: z.number().int() }))
		.readonly(),
	outcome: z.string(),
});
