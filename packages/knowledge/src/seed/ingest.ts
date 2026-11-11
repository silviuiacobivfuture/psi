import { pathToFileURL } from "node:url";
import { z } from "zod";
import type { Embedder } from "../embedder/types";
import { createKnowledge, type IngestReport } from "../knowledge";
import type { VectorConfig } from "../store/config";
import { SEED } from "./index";

export const DEFAULT_DB_URL = "file:.data/knowledge.db";

/**
 * Ingests the seed into the configured store: `vector` if given, else Chroma when `CHROMA_URL` is
 * set, else the LibSQL database at `url`. Re-running replaces the same entries.
 */
export async function ingestSeed(opts: {
	url: string;
	embedder?: Embedder;
	vector?: VectorConfig;
}): Promise<IngestReport> {
	const k = createKnowledge(opts);
	try {
		return await k.ingest(SEED);
	} finally {
		await k.close();
	}
}

const Env = z.object({
	PSI_KNOWLEDGE_DB_URL: z.string().trim().min(1).default(DEFAULT_DB_URL),
});

async function main(): Promise<void> {
	const env = Env.parse({ PSI_KNOWLEDGE_DB_URL: process.env.PSI_KNOWLEDGE_DB_URL || undefined });
	const report = await ingestSeed({ url: env.PSI_KNOWLEDGE_DB_URL });
	const { embedder } = report;
	process.stdout.write(
		[
			`store: ${report.store.kind} (${report.store.location})`,
			`embedder: ${embedder.kind} (${embedder.model}, ${embedder.dimension ?? "-"} dimensions)`,
			`indexed: ${report.indexed.length} entries, ${report.chunks} chunks`,
			`skipped: ${report.skipped.length}`,
			"",
		].join("\n"),
	);
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
	main().catch((err: unknown) => {
		process.stderr.write(
			`ingest-seed failed: ${err instanceof Error ? err.message : String(err)}\n`,
		);
		process.exitCode = 1;
	});
}
