import { resolve } from "node:path";
import { createGuide, type Guide } from "@psi/guide";
import { createKnowledge } from "@psi/knowledge";
import { aiSettings } from "./ai-settings";

/**
 * The one guide this site talks to: EQ-SYNC's Mastra agent on OpenRouter (OPENROUTER_API_KEY),
 * reading the knowledge base at PSI_KNOWLEDGE_DB_URL (local default: .data/knowledge.db, seeded by
 * `pnpm knowledge:seed`). No memory: nothing a visitor asks is kept. The admin's AI settings come
 * from the CMS (`aiSettings`); without a CMS key, PSI_GUIDE_SETTINGS or the defaults.
 */
export const guide: Guide = createGuide({
	brand: "eqsync",
	knowledge: createKnowledge({
		url: process.env.PSI_KNOWLEDGE_DB_URL ?? `file:${resolve(".data/knowledge.db")}`,
	}),
	...(aiSettings === null ? {} : { settings: aiSettings.get }),
	onFailure: (failure) => console.error(`guide: ${failure.stage} failed`),
});
