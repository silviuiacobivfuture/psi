import type { MastraVector } from "@mastra/core/vector";
import type { EngineKnowledge, KnowledgeQuery, Passage } from "@psi/engine";
import { z } from "zod";
import { BrandSchema, type Knowledge, LocaleSchema } from "./contract";

/**
 * `@psi/knowledge`'s search (by brand and locale) as the engine's knowledge (by scope and
 * locale): a profile's scope is its brand. A scope or locale that is not psi's is an error, which
 * the engine reports as a retrieval failure.
 */
export function engineKnowledge(knowledge: Knowledge): EngineKnowledge {
	return {
		async search(q: KnowledgeQuery): Promise<ReadonlyArray<Passage>> {
			return knowledge.search({
				query: q.query,
				brand: BrandSchema.parse(q.scope),
				locale: LocaleSchema.parse(q.locale),
				...(q.topK === undefined ? {} : { topK: q.topK }),
			});
		},
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
