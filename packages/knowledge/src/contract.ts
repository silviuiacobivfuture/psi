import { z } from "zod";

/**
 * The contract `@psi/guide` consumes. Changing anything here is a breaking change for the guide.
 */

export const BRANDS = ["psizone", "eqsync", "hemisync", "blog"] as const;
export const LOCALES = ["ro", "en"] as const;

export const BrandSchema = z.enum(BRANDS);
export const LocaleSchema = z.enum(LOCALES);

export type Brand = "psizone" | "eqsync" | "hemisync" | "blog";
export type Locale = "ro" | "en";

/** The page a passage comes from, with its clinical review stamp (null when not reviewed). */
export interface Source {
	id: string;
	title: string;
	url: string;
	reviewedBy: string | null;
	reviewedAt: string | null;
}

/** One retrieved chunk of reviewed content, with its cosine similarity to the query. */
export interface Passage {
	source: Source;
	text: string;
	score: number;
}

export interface Knowledge {
	search(q: {
		query: string;
		brand: Brand;
		locale: Locale;
		topK?: number;
	}): Promise<ReadonlyArray<Passage>>;
}

export const DEFAULT_TOP_K = 5;
export const MAX_TOP_K = 50;

export const MAX_QUERY_CHARS = 2000;

/**
 * The search input, parsed at the boundary. Queries come from a model's tool call, so search
 * degrades instead of throwing: the query is trimmed and cut to MAX_QUERY_CHARS (a blank one
 * finds nothing), and topK is clamped to MAX_TOP_K. A non-integer or non-positive topK, or an
 * unknown brand or locale, is still an error.
 */
export const SearchQuerySchema = z.object({
	query: z.string().transform((q) => Array.from(q.trim()).slice(0, MAX_QUERY_CHARS).join("")),
	brand: BrandSchema,
	locale: LocaleSchema,
	topK: z
		.number()
		.int()
		.min(1)
		.default(DEFAULT_TOP_K)
		.transform((k) => Math.min(k, MAX_TOP_K)),
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;
