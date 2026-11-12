import type { MastraVector } from "@mastra/core/vector";
import type { EngineCatalog, EngineKnowledge, KnowledgeQuery, Passage } from "@psi/engine";
import { isDemoId, type Tiered } from "@psi/knowledge";
import { z } from "zod";
import { BrandSchema, type Knowledge, LocaleSchema } from "./contract";

/**
 * `@psi/knowledge`'s search (by brand and locale) as the engine's knowledge (by scope and
 * locale): a profile's scope is its brand. A scope or locale that is not psi's is an error, which
 * the engine reports as a retrieval failure. Unless `demo` is on (`PSI_DEMO_KNOWLEDGE=true`),
 * passages from demo entries (`demo-` ids) are dropped, so a store that still holds the demo
 * never serves it.
 */
export function engineKnowledge(
	knowledge: Knowledge,
	opts: { demo: boolean; tiered?: Tiered; catalog?: EngineCatalog; ready?: Promise<void> },
): EngineKnowledge {
	return {
		async search(q: KnowledgeQuery): Promise<ReadonlyArray<Passage>> {
			// With the demo off, fetch more and filter, so demo twins never crowd out real passages.
			const topK = q.topK ?? 5;
			const query = {
				query: q.query,
				brand: BrandSchema.parse(q.scope),
				locale: LocaleSchema.parse(q.locale),
				topK: opts.demo ? topK : Math.min(topK * 3, 50),
			};
			// The catalog (the lexical tier) is seeded at startup; the first searches wait for it.
			await opts.ready;
			const found =
				opts.tiered === undefined
					? await knowledge.search(query)
					: await opts.tiered.search({
							...query,
							...(q.mode === undefined ? {} : { mode: q.mode }),
						});
			return opts.demo ? found : found.filter((p) => !isDemoId(p.source.id)).slice(0, topK);
		},
		...(opts.catalog === undefined ? {} : { catalog: opts.catalog }),
	};
}

const VectorSchema = z.custom<MastraVector>(
	(value) =>
		typeof value === "object" &&
		value !== null &&
		"query" in value &&
		typeof value.query === "function" &&
		"upsert" in value &&
		typeof value.upsert === "function",
);

/** A knowledge base that carries its Mastra vector store (`createKnowledge` from `@psi/knowledge`). */
const StoreSchema = z.object({
	vector: VectorSchema,
	store: z.object({ kind: z.enum(["libsql", "chroma"]) }),
});

/**
 * The vector store behind a `@psi/knowledge` knowledge base, to register with Mastra under its
 * kind (`chroma` or `libsql`); none for a knowledge base that does not expose one.
 */
export function knowledgeVectors(knowledge: Knowledge): Readonly<Record<string, MastraVector>> {
	const parsed = StoreSchema.safeParse(knowledge);
	return parsed.success ? { [parsed.data.store.kind]: parsed.data.vector } : {};
}
