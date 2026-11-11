import type { ToolsInput } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { Brand, Knowledge, Locale, Passage } from "./contract";
import { PassagesSchema } from "./contract";
import { within } from "./deadline";
import type { NumberedPassage, SourceLedger } from "./ledger";

/** How many passages one search brings back. */
export const TOP_K = 5;

/** A search already scoped to one brand and locale, with a deadline, its output parsed. */
export type ScopedSearch = (query: string) => Promise<ReadonlyArray<Passage>>;

export interface ScopeOptions {
	knowledge: Knowledge;
	brand: Brand;
	locale: Locale;
	timeoutMs: number;
	signal: AbortSignal;
}

/** Binds `Knowledge.search` to a brand and locale; the result is parsed, never trusted as is. */
export function scopeSearch(opts: ScopeOptions): ScopedSearch {
	return async (query) => {
		const found = await within(
			opts.knowledge.search({ query, brand: opts.brand, locale: opts.locale, topK: TOP_K }),
			opts.timeoutMs,
			"knowledge search",
			opts.signal,
		);
		return PassagesSchema.parse(found);
	};
}

const NumberedPassageSchema: z.ZodType<NumberedPassage> = z.object({
	n: z.number().int().positive(),
	title: z.string(),
	text: z.string(),
});

const SearchInputSchema = z.object({
	query: z.string().trim().min(1).max(300).describe("What to look up, in the question's language"),
});

const SearchOutputSchema = z.object({ passages: z.array(NumberedPassageSchema).readonly() });

export type SearchKnowledgeOutput = z.infer<typeof SearchOutputSchema>;

/**
 * The toolset holding `searchKnowledge`, the guide's only window on content. Every passage it
 * returns is registered in the answer's ledger, so citations to it are numbered with the rest.
 */
export function searchKnowledgeTools(search: ScopedSearch, ledger: SourceLedger): ToolsInput {
	const searchKnowledge = createTool({
		id: "searchKnowledge",
		description:
			"Search the reviewed, published content of this site. Returns numbered passages; cite them as [n].",
		inputSchema: SearchInputSchema,
		outputSchema: SearchOutputSchema,
		execute: async ({ query }): Promise<SearchKnowledgeOutput> => ({
			passages: ledger.register(await search(query)),
		}),
	});
	return { searchKnowledge };
}
