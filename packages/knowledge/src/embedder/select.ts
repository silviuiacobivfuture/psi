import { z } from "zod";
import { createLexicalEmbedder } from "./lexical";
import { createOpenRouterEmbedder, DEFAULT_EMBED_MODEL } from "./openrouter";
import type { Embedder } from "./types";

const EmbedEnv = z.object({
	OPENROUTER_API_KEY: z
		.string()
		.optional()
		.transform((v) => (v === undefined || v.trim() === "" ? undefined : v.trim())),
	PSI_EMBED_MODEL: z
		.string()
		.optional()
		.transform((v) => (v === undefined || v.trim() === "" ? DEFAULT_EMBED_MODEL : v.trim())),
});

/**
 * OpenRouter embeddings when `OPENROUTER_API_KEY` is set (model from `PSI_EMBED_MODEL`, default
 * `openai/text-embedding-3-small`); otherwise the lexical development fallback.
 */
export function embedderFromEnv(env: Record<string, string | undefined> = process.env): Embedder {
	const e = EmbedEnv.parse({
		OPENROUTER_API_KEY: env.OPENROUTER_API_KEY,
		PSI_EMBED_MODEL: env.PSI_EMBED_MODEL,
	});
	if (e.OPENROUTER_API_KEY !== undefined) {
		return createOpenRouterEmbedder({ apiKey: e.OPENROUTER_API_KEY, model: e.PSI_EMBED_MODEL });
	}
	return createLexicalEmbedder();
}
