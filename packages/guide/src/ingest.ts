import type { EngineIngest, EngineIngestReport } from "@psi/engine";
import {
	type Catalog,
	DEMO,
	isDemoId,
	type KnowledgeEntry,
	KnowledgeEntrySchema,
	type KnowledgeStore,
	SEED,
} from "@psi/knowledge";
import { z } from "zod";

const Entries = z.array(KnowledgeEntrySchema);

/**
 * `@psi/knowledge`'s ingest as the engine's ingest port, for the `ingest-knowledge` workflow. The
 * entries are parsed here (zod); the knowledge base applies its retrievability rule, names its
 * indexes, chunks with `MDocument`, embeds and upserts into the vector store registered with
 * Mastra. Named sets: `seed` always, `demo` only when `demo` is on. Demo entries given as a
 * payload are refused when it is off.
 */
export function knowledgeIngest(
	store: KnowledgeStore,
	opts: { demo: boolean; catalog?: Catalog },
): EngineIngest {
	return {
		sets: opts.demo ? { seed: () => SEED, demo: () => DEMO } : { seed: () => SEED },
		async ingest(input: ReadonlyArray<unknown>): Promise<EngineIngestReport> {
			const entries: ReadonlyArray<KnowledgeEntry> = Entries.parse(input);
			if (!opts.demo && entries.some((e) => isDemoId(e.id))) {
				throw new Error("demo entries need PSI_DEMO_KNOWLEDGE=true (local development only)");
			}
			const report = await store.ingest(entries);
			// The store keeps its own catalog in step; a separate one (the guide's) is updated here.
			if (opts.catalog !== undefined && opts.catalog !== store.catalog) {
				await opts.catalog.add(entries);
			}
			return {
				store: `${report.store.kind} (${report.store.location})`,
				embedder: `${report.embedder.kind} (${report.embedder.model})`,
				dimension: report.embedder.dimension,
				indexed: report.indexed,
				skipped: report.skipped,
				chunks: report.chunks,
			};
		},
	};
}
