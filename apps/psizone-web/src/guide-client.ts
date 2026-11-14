import { resolve } from "node:path";
import { createGuide, type Guide, schedulingFromEnv, schedulingPort } from "@psi/guide";
import { createKnowledge } from "@psi/knowledge";
import { countingGuide, type GuideCounters, guideCountsFromEnv } from "@psi/site-control";
import { devLog } from "@psi/ui";
import { aiSettings } from "./ai-settings";
import { scheduling } from "./booking-store";

/**
 * The team's settings and meters for the site's assistant, read from the scheduling store with this site's own key
 * (`CONVEX_URL`, `PSI_SCHEDULING_KEY`, the account pages' too); without them the CMS's settings and the engine's limits.
 */
const STORE = schedulingFromEnv(process.env);

/** The CMS's reading counters (CMS_URL, ANALYTICS_INGEST_TOKEN): the day's questions, and how the invitation fares. */
export const guideCounts = guideCountsFromEnv(process.env, "psizone");

/**
 * The one guide this site talks to: Psizone's Mastra agent on OpenRouter (OPENROUTER_API_KEY),
 * reading the knowledge base at PSI_KNOWLEDGE_DB_URL (local default: .data/knowledge.db, seeded by
 * `pnpm knowledge:seed`). No memory: nothing a visitor asks is kept. With scheduling on, a booking
 * question is answered from the scheduling service, through the same client and service key as
 * the booking forms (the guide's port finds, holds, submits and cancels, and books only after the
 * visitor confirmed a summary). Wrapped once so the control plane sees today's question counts.
 */
export const guide: Guide & GuideCounters = countingGuide(
	createGuide({
		brand: "psizone",
		knowledge: createKnowledge({
			url: process.env.PSI_KNOWLEDGE_DB_URL ?? `file:${resolve(".data/knowledge.db")}`,
		}),
		...(scheduling === undefined ? {} : { scheduling: schedulingPort(scheduling) }),
		// The team's settings for the site's assistant (Setări → Asistent): its limits, budget and model, over the CMS's.
		...(STORE.ok ? { visitorAssistant: STORE.scheduling.assistant } : {}),
		// Only when the team keeps transcripts: one line per finished turn, already redacted as they set it.
		onTranscript: (transcript) =>
			console.info(JSON.stringify({ event: "transcript", ...transcript })),
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
