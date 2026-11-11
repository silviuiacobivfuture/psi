import { z } from "zod";

/** The page a passage comes from, with its review stamp (null when not reviewed). */
export interface Source {
	id: string;
	title: string;
	url: string;
	reviewedBy: string | null;
	reviewedAt: string | null;
}

/** One retrieved chunk of reviewed content, with its similarity to the query. */
export interface Passage {
	source: Source;
	text: string;
	score: number;
}

/** What the engine asks its knowledge for: a query, in one scope (a profile's) and one locale. */
export interface KnowledgeQuery {
	query: string;
	/** The profile's `knowledgeScope`: which index or collection set the search may read. */
	scope: string;
	locale: string;
	topK?: number;
}

/**
 * The engine's only window on content. Anything that searches reviewed content by scope and
 * locale fits; whatever it returns is parsed with `PassagesSchema` before the engine trusts it.
 */
export interface EngineKnowledge {
	search(query: KnowledgeQuery): Promise<ReadonlyArray<Passage>>;
}

export const SourceSchema: z.ZodType<Source> = z.object({
	id: z.string().min(1),
	title: z.string(),
	url: z.string(),
	reviewedBy: z.string().nullable(),
	reviewedAt: z.string().nullable(),
});

export const PassageSchema: z.ZodType<Passage> = z.object({
	source: SourceSchema,
	text: z.string(),
	score: z.number(),
});

export const PassagesSchema: z.ZodType<ReadonlyArray<Passage>> = z.array(PassageSchema).readonly();

export const EngineKnowledgeSchema: z.ZodType<EngineKnowledge> = z.custom<EngineKnowledge>(
	(value) =>
		typeof value === "object" &&
		value !== null &&
		"search" in value &&
		typeof value.search === "function",
	{ message: "knowledge must have a search function" },
);

/** A locale code: `ro`, `en`, `pt-BR`. */
export const LocaleCodeSchema: z.ZodType<string> = z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/);
