import { resolve } from "node:path";
import { createGuide, type Guide, schedulingFromEnv } from "@psi/guide";
import { createKnowledge } from "@psi/knowledge";
import { countingGuide, type GuideCounters, guideCountsFromEnv } from "@psi/site-control";
import { devLog } from "@psi/ui";
import { aiSettings } from "./ai-settings";

/** The scheduling store (Convex) when configured: booking questions then get free times in the chat. */
const SCHEDULING = schedulingFromEnv(process.env);

/** The CMS's reading counters (CMS_URL, ANALYTICS_INGEST_TOKEN): the day's questions, and how the invitation fares. */
export const guideCounts = guideCountsFromEnv(process.env, "psizone");

/**
 * The one guide this site talks to: Psizone's Mastra agent on OpenRouter (OPENROUTER_API_KEY),
 * reading the knowledge base at PSI_KNOWLEDGE_DB_URL (local default: .data/knowledge.db, seeded by
 * `pnpm knowledge:seed`). No memory: nothing a visitor asks is kept. With scheduling on, a booking
 * question is answered with free times from @psi/scheduling only (the guide's port finds, holds,
 * submits and cancels, and books only after the visitor confirmed a summary). Wrapped once so the control plane sees today's question counts.
 */
export const guide: Guide & GuideCounters = countingGuide(
	createGuide({
		brand: "psizone",
		knowledge: createKnowledge({
			url: process.env.PSI_KNOWLEDGE_DB_URL ?? `file:${resolve(".data/knowledge.db")}`,
		}),
		...(SCHEDULING.ok ? { scheduling: SCHEDULING.scheduling.port } : {}),
		// The admin's AI settings from the CMS; without a CMS key, PSI_GUIDE_SETTINGS or the defaults.
		...(aiSettings === null ? {} : { settings: aiSettings.get }),
		onFailure: (failure) => {
			console.error(`guide: ${failure.stage} failed: ${failure.error}`);
			devLog("guide.failure", {
				stage: failure.stage,
				error: failure.error,
			});
		},
		// Where each turn's time went (counts and milliseconds only), for the local debug log.
		onTiming: (timing) => devLog("guide.timing", { ...timing }),
		// The store's and the embedder's connections open at boot, not on the first visitor's turn.
		warmUp: true,
	}),
	{ reporter: guideCounts },
);
