import { AI_SETTINGS_DEFAULTS, type AiSettings, settingsFor } from "@psi/cms-client";
import type { Payload } from "payload";
import type { Brand } from "../authz/types";
import { env } from "../env";
import { type PipelinePorts, runSource, serial } from "./ingest-source";
import { sourceIndex } from "./ingest-store";
import { type SourceDoc, SourceDocSchema } from "./source-doc";

export const SOURCES = "knowledge-sources";
/** Set on the pipeline's own writes, so the hooks do not run the pipeline again. */
export const INTERNAL = "psiKnowledgePipeline";

/** The brand's AI settings as the sites read them; the defaults when the global is unreadable. */
export async function brandSettings(payload: Payload, brand: Brand): Promise<AiSettings> {
	const raw = await payload
		.findGlobal({ slug: "ai-settings", depth: 0, overrideAccess: true })
		.catch(() => null);
	return settingsFor(raw, brand) ?? AI_SETTINGS_DEFAULTS;
}

export async function loadSource(payload: Payload, id: string): Promise<SourceDoc | null> {
	const raw: unknown = await payload
		.findByID({ collection: SOURCES, id, depth: 0, overrideAccess: true, disableErrors: true })
		.catch(() => null);
	const parsed = SourceDocSchema.safeParse(raw);
	return parsed.success ? parsed.data : null;
}

/** The pipeline's ports over Payload's Local API (its own transaction per write). */
export function payloadPorts(payload: Payload): PipelinePorts {
	return {
		load: (id) => loadSource(payload, id),
		async save(id, patch) {
			await payload.update({
				collection: SOURCES,
				id,
				data: patch,
				depth: 0,
				overrideAccess: true,
				context: { [INTERNAL]: true },
			});
		},
		index: async (doc) => sourceIndex(doc.brand, await brandSettings(payload, doc.brand)),
		serverUrl: env().SERVER_URL,
		now: () => new Date(),
	};
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Runs the pipeline after the save that asked for it has committed (the hook runs inside the
 * save's transaction): it waits until the stored document is at least as new as the saved one.
 */
export function runAfterCommit(payload: Payload, id: string, savedAt: string | null): void {
	void serial(id, async () => {
		for (let i = 0; i < 20; i++) {
			await sleep(i === 0 ? 150 : 300);
			const doc = await loadSource(payload, id);
			if (doc !== null && (savedAt === null || (doc.updatedAt ?? "") >= savedAt)) break;
		}
		const out = await runSource(payloadPorts(payload), id);
		payload.logger.info({ id, outcome: out.kind }, "knowledge source: ingestion run");
	}).catch((err: unknown) => payload.logger.error({ err, id }, "knowledge source: run failed"));
}
