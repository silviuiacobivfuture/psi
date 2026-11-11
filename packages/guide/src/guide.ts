import { z } from "zod";
import { createBrandAgent } from "./agent";
import {
	DEFAULT_TIMEOUTS,
	type GuideFailure,
	type GuideTimeouts,
	runAsk,
	type ThreadAgent,
} from "./ask";
import { type Brand, BrandSchema, type Knowledge } from "./contract";
import type { AskInput, GuideEvent } from "./events";
import { openMemory } from "./memory";
import { DEFAULT_MODEL, ModelIdSchema, openRouterModel, readGuideEnv } from "./model";

export interface GuideOptions {
	brand: Brand;
	knowledge: Knowledge;
	/** OpenRouter key; defaults to `OPENROUTER_API_KEY`. Without one every answer is `unavailable`. */
	apiKey?: string;
	/** OpenRouter model slug; defaults to `PSI_GUIDE_MODEL`, then `DEFAULT_MODEL`. */
	model?: string;
	/** Conversation memory on LibSQL (e.g. `file:.data/guide.db`), used only for asks with a threadId. */
	memory?: { url: string };
	/** OpenRouter API base URL; for a proxy. Defaults to `https://openrouter.ai/api/v1`. */
	baseURL?: string;
	/** Time budgets; see `GuideTimeouts`. */
	timeouts?: Partial<GuideTimeouts>;
	/** Called when an answer becomes `unavailable`; carries no visitor content. */
	onFailure?: (failure: GuideFailure) => void;
}

export interface AskControl {
	/** Aborts the answer (e.g. the visitor closed the SSE connection). */
	signal?: AbortSignal;
}

export interface Guide {
	readonly brand: Brand;
	/** The OpenRouter model slug in use. */
	readonly model: string;
	/** Streams one answer. Never throws: failures arrive as `refusal` events. */
	ask(input: AskInput, control?: AskControl): AsyncIterable<GuideEvent>;
}

const KnowledgeSchema: z.ZodType<Knowledge> = z.custom<Knowledge>(
	(value) =>
		typeof value === "object" &&
		value !== null &&
		"search" in value &&
		typeof value.search === "function",
	{ message: "knowledge must have a search function" },
);

const Millis = z.number().int().positive().max(600_000);

const GuideOptionsSchema = z.object({
	brand: BrandSchema,
	knowledge: KnowledgeSchema,
	apiKey: z.string().trim().min(1).optional(),
	model: ModelIdSchema.optional(),
	memory: z.object({ url: z.string().trim().min(1) }).optional(),
	baseURL: z.string().url().optional(),
	timeouts: z.object({ retrievalMs: Millis, idleMs: Millis, totalMs: Millis }).partial().optional(),
	onFailure: z
		.custom<(failure: GuideFailure) => void>((value) => typeof value === "function")
		.optional(),
});

/**
 * Creates the guide for one brand. Options are validated here, so a misconfiguration fails at
 * startup; after that nothing throws to the caller. The API key and model come from the options or
 * the environment (`OPENROUTER_API_KEY`, `PSI_GUIDE_MODEL`); they are read once, here.
 */
export function createGuide(options: GuideOptions): Guide {
	const opts = GuideOptionsSchema.parse(options);
	const env = readGuideEnv(process.env);
	const apiKey = opts.apiKey ?? env.apiKey;
	const modelId = opts.model ?? env.model ?? DEFAULT_MODEL;
	const timeouts: GuideTimeouts = { ...DEFAULT_TIMEOUTS, ...opts.timeouts };
	const model =
		apiKey === undefined
			? undefined
			: openRouterModel({
					apiKey,
					modelId,
					...(opts.baseURL === undefined ? {} : { baseURL: opts.baseURL }),
				});
	const agent = model === undefined ? undefined : createBrandAgent({ brand: opts.brand, model });

	let threads: ThreadAgent | undefined;
	const memoryOptions = opts.memory;
	const openThreadAgent =
		model === undefined || memoryOptions === undefined
			? undefined
			: (): ThreadAgent => {
					if (threads === undefined) {
						const memory = openMemory(memoryOptions.url);
						threads = { agent: createBrandAgent({ brand: opts.brand, model, memory }), memory };
					}
					return threads;
				};

	return {
		brand: opts.brand,
		model: modelId,
		ask: (input, control) =>
			runAsk(
				{
					brand: opts.brand,
					knowledge: opts.knowledge,
					timeouts,
					onFailure: opts.onFailure,
					agent,
					threadAgent: openThreadAgent,
				},
				input,
				control?.signal,
			),
	};
}
