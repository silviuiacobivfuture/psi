import type { AiSettings } from "@psi/cms-client";
import type { Passage } from "@psi/knowledge";
import type { Brand } from "../authz/types";
import { sourceIndex } from "./ingest-store";
import { sourceOfEntry } from "./source-plan";

/**
 * The detail page's "Test retrieval": a query → the brand's top chunks with their scores, the
 * way the guide's retrieval tiers would find them, and which of them come from this source. It
 * embeds the query (when embeddings are on) and NEVER calls a chat model.
 */
export interface RetrievalHit {
	entryId: string;
	title: string;
	url: string;
	text: string;
	score: number;
	fromThis: boolean;
}

export interface RetrievalResult {
	mode: "semantic" | "lexical";
	note: string | null;
	hits: RetrievalHit[];
}

function hits(passages: ReadonlyArray<Passage>, sourceId: string): RetrievalHit[] {
	return passages.map((p) => ({
		entryId: p.source.id,
		title: p.source.title,
		url: p.source.url,
		text: p.text.slice(0, 400),
		score: Math.round(p.score * 1000) / 1000,
		fromThis: sourceOfEntry(p.source.id) === sourceId,
	}));
}

export async function testRetrieval(args: {
	brand: Brand;
	locale: "ro" | "en";
	query: string;
	sourceId: string;
	settings: AiSettings;
	topK?: number;
}): Promise<RetrievalResult> {
	const topK = args.topK ?? 8;
	const index = await sourceIndex(args.brand, args.settings);
	const lexical = async (note: string | null): Promise<RetrievalResult> => {
		const { createCatalog } = await import("@psi/knowledge");
		const catalog = createCatalog();
		catalog.mirror(args.brand, await index.store.stored(args.brand), () => false);
		const found = catalog.search({
			query: args.query,
			brand: args.brand,
			locale: args.locale,
			topK,
		});
		return { mode: "lexical", note, hits: hits(found, args.sourceId) };
	};
	if (args.settings.embeddings === "lexical" || index.store.embedder.kind === "lexical") {
		return lexical(null);
	}
	try {
		const found = await index.search({ query: args.query, locale: args.locale, topK });
		return { mode: "semantic", note: null, hits: hits(found, args.sourceId) };
	} catch (error) {
		return lexical(error instanceof Error ? error.message.slice(0, 200) : "embedding failed");
	}
}
