import { resolve } from "node:path";
import { createGuide, type Guide } from "@psi/guide";
import { createKnowledge } from "@psi/knowledge";

/**
 * The one guide this site talks to: Psizone's Mastra agent on OpenRouter (OPENROUTER_API_KEY),
 * reading the knowledge base at PSI_KNOWLEDGE_DB_URL (local default: .data/knowledge.db, seeded by
 * `pnpm knowledge:seed`). No memory: nothing a visitor asks is kept.
 */
export const guide: Guide = createGuide({
	brand: "psizone",
	knowledge: createKnowledge({
		url: process.env.PSI_KNOWLEDGE_DB_URL ?? `file:${resolve(".data/knowledge.db")}`,
	}),
	onFailure: (failure) => console.error(`guide: ${failure.stage} failed`),
});
