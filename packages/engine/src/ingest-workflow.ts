import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

/** The workflow's id in Mastra's registry (and in Studio); registered as `ingestKnowledge`. */
export const INGEST_KNOWLEDGE_WORKFLOW = "ingest-knowledge";

/** What one ingest did, as the consumer's knowledge base reports it. */
export interface EngineIngestReport {
	/** The vector store written to, and where; no secrets. */
	store: string;
	/** The embedder that produced the vectors (kind and model). */
	embedder: string;
	dimension: number | null;
	/** Entries now retrievable, with their index and chunk count. */
	indexed: ReadonlyArray<{ id: string; index: string; chunks: number }>;
	/** Entries the consumer's retrievability rule refused, with the reason. */
	skipped: ReadonlyArray<{ id: string; reason: string }>;
	chunks: number;
}

/**
 * The consumer's ingest, as the engine sees it. The engine is brand-agnostic: it knows nothing of
 * an entry's shape, its index naming or which entries may be retrieved. The consumer's `ingest`
 * parses the entries (zod), applies its retrievability rule, chunks them (Mastra RAG's
 * `MDocument`), embeds them and upserts them into the vector store it registered with Mastra.
 */
export interface EngineIngest {
	/** Named entry sets the workflow can ingest without a payload (`seed`, `demo`). */
	sets?: Readonly<Record<string, () => ReadonlyArray<unknown>>>;
	ingest(entries: ReadonlyArray<unknown>): Promise<EngineIngestReport>;
}

export const EngineIngestReportSchema: z.ZodType<EngineIngestReport> = z.object({
	store: z.string(),
	embedder: z.string(),
	dimension: z.number().int().positive().nullable(),
	indexed: z.array(z.object({ id: z.string(), index: z.string(), chunks: z.number().int() })),
	skipped: z.array(z.object({ id: z.string(), reason: z.string() })),
	chunks: z.number().int().nonnegative(),
});

const InputSchema = z.object({
	/** Named sets to ingest, e.g. `["seed", "demo"]`. */
	sets: z.array(z.string().trim().min(1)).default([]),
	/** Entries to ingest as given, in the consumer's entry shape. */
	entries: z.array(z.record(z.unknown())).default([]),
});

const CollectedSchema = z.object({
	entries: z.array(z.unknown()),
	sets: z.array(z.object({ name: z.string(), entries: z.number().int() })),
});

const OutputSchema = z.object({
	sets: z.array(z.object({ name: z.string(), entries: z.number().int() })),
	report: EngineIngestReportSchema,
});

function buildWorkflow(port: EngineIngest) {
	const named = port.sets ?? {};
	const collect = createStep({
		id: "collect",
		description: `Gathers the entries: the named sets (${Object.keys(named).join(", ") || "none"}) and any given`,
		inputSchema: InputSchema,
		outputSchema: CollectedSchema,
		execute: async ({ inputData }) => {
			const sets: Array<{ name: string; entries: number }> = [];
			const entries: Array<unknown> = [];
			for (const name of new Set(inputData.sets)) {
				const load = named[name];
				if (load === undefined) {
					throw new Error(`unknown entry set "${name}"; known: ${Object.keys(named).join(", ")}`);
				}
				const set = load();
				sets.push({ name, entries: set.length });
				entries.push(...set);
			}
			entries.push(...inputData.entries);
			if (entries.length === 0) throw new Error("nothing to ingest: name a set or give entries");
			return { entries, sets };
		},
	});
	const ingest = createStep({
		id: "ingest",
		description:
			"Parses the entries, applies the retrievability rule, chunks (MDocument), embeds and upserts into the registered vector store",
		inputSchema: CollectedSchema,
		outputSchema: OutputSchema,
		execute: async ({ inputData }) => ({
			sets: inputData.sets,
			report: EngineIngestReportSchema.parse(await port.ingest(inputData.entries)),
		}),
	});
	return createWorkflow({
		id: INGEST_KNOWLEDGE_WORKFLOW,
		description: "Ingests knowledge entries (named sets or given ones) into the vector store",
		inputSchema: InputSchema,
		outputSchema: OutputSchema,
	})
		.then(collect)
		.then(ingest)
		.commit();
}

/** The workflow `createEngine` registers when it is given an ingest. */
export type IngestKnowledgeWorkflow = ReturnType<typeof buildWorkflow>;

/** Builds the `ingest-knowledge` workflow over a consumer's ingest. */
export function createIngestWorkflow(port: EngineIngest): IngestKnowledgeWorkflow {
	return buildWorkflow(port);
}
