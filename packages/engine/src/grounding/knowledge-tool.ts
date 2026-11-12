import type { ToolsInput } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
	type EngineKnowledge,
	type KnowledgeQuery,
	type Passage,
	PassagesSchema,
} from "../contract";
import { within } from "../deadline";
import type { NumberedPassage, SourceLedger } from "./ledger";

/** How many passages one search brings back. */
export const TOP_K = 5;

/** The tool's id, as the prompts name it. */
export const SEARCH_TOOL_ID = "searchKnowledge";

/** A search already scoped to one profile and locale, with a deadline, its output parsed. */
export type ScopedSearch = (query: string) => Promise<ReadonlyArray<Passage>>;

export interface ScopeOptions {
	knowledge: EngineKnowledge;
	scope: string;
	locale: string;
	timeoutMs: number;
	signal: AbortSignal;
	/** How the search may retrieve (the runtime settings). */
	mode?: KnowledgeQuery["mode"];
}

/** Binds `EngineKnowledge.search` to a scope and locale; the result is parsed, never trusted as is. */
export function scopeSearch(opts: ScopeOptions): ScopedSearch {
	return async (query) => {
		const found = await within(
			opts.knowledge.search({
				query,
				scope: opts.scope,
				locale: opts.locale,
				topK: TOP_K,
				...(opts.mode === undefined ? {} : { mode: opts.mode }),
			}),
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

const SearchOutputSchema = z.object({ passages: z.array(NumberedPassageSchema).readonly() });

export type SearchKnowledgeOutput = z.infer<typeof SearchOutputSchema>;

/**
 * The toolset holding `searchKnowledge`, the agent's only window on content during an answer.
 * Every passage it returns is registered in the answer's ledger, so citations to it are numbered
 * with the rest. `languageName` is the site's language, the one the index is searched in.
 */
export function searchKnowledgeTools(
	search: ScopedSearch,
	ledger: SourceLedger,
	languageName: string,
): ToolsInput {
	const searchKnowledge = createTool({
		id: SEARCH_TOOL_ID,
		description:
			"Search the reviewed, published content of this site. Returns numbered passages; cite them as [n].",
		inputSchema: z.object({
			query: z
				.string()
				.trim()
				.min(1)
				.max(300)
				.describe(`What to look up, written in ${languageName}, the site's language`),
		}),
		outputSchema: SearchOutputSchema,
		execute: async ({ query }): Promise<SearchKnowledgeOutput> => ({
			passages: ledger.register(await search(query)),
		}),
	});
	return { [SEARCH_TOOL_ID]: searchKnowledge };
}
