import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import { fnv1a } from "../hash";
import { type Embedder, parseVectors } from "./types";

/** OpenRouter's embeddings endpoint (POST /embeddings), via @openrouter/ai-sdk-provider. */
export const DEFAULT_EMBED_MODEL = "openai/text-embedding-3-small";
const BATCH_SIZE = 64;

export interface OpenRouterEmbedderOptions {
	apiKey: string;
	/** An OpenRouter embedding model id, e.g. `openai/text-embedding-3-small`. */
	model?: string;
	/**
	 * Provider routing: `deny` (default) routes only to providers that do not store request data.
	 * Queries can carry health details (special-category data), so this stays `deny` unless an
	 * owner decides otherwise.
	 */
	dataCollection?: "allow" | "deny";
	/** For tests and proxies: the fetch the provider uses. */
	fetch?: typeof fetch;
	baseURL?: string;
}

const Options = z.object({
	apiKey: z.string().trim().min(1),
	model: z.string().trim().min(1).default(DEFAULT_EMBED_MODEL),
	dataCollection: z.enum(["allow", "deny"]).default("deny"),
	baseURL: z.string().url().optional(),
});

/** A short, stable vector-space name for a model: `or_<slug>_<hash>` (≤ 24 chars). */
export function openRouterSpace(model: string): string {
	const slug = model
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 11);
	return `or_${slug}_${fnv1a(model).toString(16).padStart(8, "0")}`;
}

export function createOpenRouterEmbedder(opts: OpenRouterEmbedderOptions): Embedder {
	const o = Options.parse({
		apiKey: opts.apiKey,
		model: opts.model,
		dataCollection: opts.dataCollection,
		baseURL: opts.baseURL,
	});
	const provider = createOpenRouter({
		apiKey: o.apiKey,
		compatibility: "strict",
		...(o.baseURL === undefined ? {} : { baseURL: o.baseURL }),
		...(opts.fetch === undefined ? {} : { fetch: opts.fetch }),
	});
	const model = provider.textEmbeddingModel(o.model, {
		provider: { data_collection: o.dataCollection },
	});
	return {
		kind: "openrouter",
		model: o.model,
		space: openRouterSpace(o.model),
		embed: async (texts) => {
			const out: number[][] = [];
			for (let i = 0; i < texts.length; i += BATCH_SIZE) {
				const batch = texts.slice(i, i + BATCH_SIZE);
				const res = await model.doEmbed({ values: [...batch] });
				out.push(...parseVectors(res.embeddings, batch.length));
			}
			return parseVectors(out, texts.length);
		},
	};
}
