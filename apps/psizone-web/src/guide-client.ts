import { resolve } from "node:path";
import { createGuide, type Guide, schedulingFromEnv } from "@psi/guide";
import { createKnowledge } from "@psi/knowledge";
import { aiSettings } from "./ai-settings";

/** The scheduling store (Convex) when configured: booking questions then get free times in the chat. */
const SCHEDULING = schedulingFromEnv(process.env);

/**
 * The one guide this site talks to: Psizone's Mastra agent on OpenRouter (OPENROUTER_API_KEY),
 * reading the knowledge base at PSI_KNOWLEDGE_DB_URL (local default: .data/knowledge.db, seeded by
 * `pnpm knowledge:seed`). No memory: nothing a visitor asks is kept. With scheduling on, a booking
 * question is answered with free times from @psi/scheduling only (the guide's port finds and
 * cancels; it never holds or books).
 */
export const guide: Guide = createGuide({
	brand: "psizone",
	knowledge: createKnowledge({
		url: process.env.PSI_KNOWLEDGE_DB_URL ?? `file:${resolve(".data/knowledge.db")}`,
	}),
	...(SCHEDULING.ok ? { scheduling: SCHEDULING.scheduling.port } : {}),
	// The admin's AI settings from the CMS; without a CMS key, PSI_GUIDE_SETTINGS or the defaults.
	...(aiSettings === null ? {} : { settings: aiSettings.get }),
	onFailure: (failure) => console.error(`guide: ${failure.stage} failed`),
});
