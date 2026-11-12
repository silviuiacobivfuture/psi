import { z } from "zod";
import { chunkMarkdown } from "../chunk";
import type { Brand, Locale, Passage, Source } from "../contract";
import {
	type Kind,
	type KnowledgeEntry,
	type KnowledgeEntryInput,
	KnowledgeEntrySchema,
	retrievability,
} from "../entry";
import { type Bm25, createBm25 } from "./bm25";

/** One retrievable entry as the catalog describes it: its shape, never its text. */
export interface CatalogItem {
	id: string;
	title: string;
	url: string;
	kind: Kind;
	/** The entry's hub, else its method, else its kind: what `listTopics` groups by. */
	topic: string;
	/** How many chunks (passages) it has. */
	chunks: number;
}

interface Held {
	entry: KnowledgeEntry;
	chunks: ReadonlyArray<string>;
}

/**
 * The retrievable entries this process knows (the seed, the demo when it is on, and every entry
 * ingested through this process), by brand and locale. It backs the lexical tier (BM25 over the
 * same chunks the vector store holds) and the guide's catalog tools (topics, pages, one entry's
 * full text). The retrievability rule is applied on the way in: drafts and unreviewed clinical
 * entries are never held, and re-adding an entry as a draft removes it.
 */
export interface Catalog {
	add(entries: ReadonlyArray<KnowledgeEntryInput>): Promise<void>;
	remove(ids: ReadonlyArray<string>): void;
	/** The shape of one brand and locale: its entries' ids, titles, pages, kinds and topics. */
	items(brand: Brand, locale: Locale): ReadonlyArray<CatalogItem>;
	/** One entry's full reviewed text, as passages (one per chunk); empty when not held. */
	passages(brand: Brand, locale: Locale, id: string): ReadonlyArray<Passage>;
	/** BM25 over one brand's and locale's chunks. */
	search(q: { query: string; brand: Brand; locale: Locale; topK: number }): ReadonlyArray<Passage>;
	/** Bumped on every change, so a consumer can tell its view is stale. */
	readonly version: number;
}

function sourceOf(entry: KnowledgeEntry): Source {
	return {
		id: entry.id,
		title: entry.title,
		url: entry.url,
		reviewedBy: entry.reviewedBy,
		reviewedAt: entry.reviewedAt,
	};
}

const Ids = z.array(z.string().trim().min(1));

export function createCatalog(): Catalog {
	const held = new Map<string, Held>();
	const indexes = new Map<string, Bm25<Passage>>();
	let version = 0;

	const key = (brand: Brand, locale: Locale): string => `${brand}/${locale}`;
	const changed = (): void => {
		version += 1;
		indexes.clear();
	};
	const inScope = (brand: Brand, locale: Locale): ReadonlyArray<Held> =>
		[...held.values()].filter((h) => h.entry.brand === brand && h.entry.locale === locale);

	const index = (brand: Brand, locale: Locale): Bm25<Passage> => {
		const k = key(brand, locale);
		let found = indexes.get(k);
		if (found === undefined) {
			found = createBm25(
				inScope(brand, locale).flatMap((h) =>
					h.chunks.map((text) => ({
						text: `${h.entry.title}\n${text}`,
						value: { source: sourceOf(h.entry), text, score: 0 },
					})),
				),
			);
			indexes.set(k, found);
		}
		return found;
	};

	return {
		get version() {
			return version;
		},
		async add(input) {
			const entries = z.array(KnowledgeEntrySchema).parse(input);
			for (const entry of entries) {
				if (!retrievability(entry).retrievable) {
					held.delete(entry.id);
					continue;
				}
				held.set(entry.id, { entry, chunks: await chunkMarkdown(entry.body) });
			}
			changed();
		},
		remove(ids) {
			for (const id of Ids.parse(ids)) held.delete(id);
			changed();
		},
		items(brand, locale) {
			return inScope(brand, locale).map((h) => ({
				id: h.entry.id,
				title: h.entry.title,
				url: h.entry.url,
				kind: h.entry.kind,
				topic: h.entry.hub ?? h.entry.method ?? h.entry.kind,
				chunks: h.chunks.length,
			}));
		},
		passages(brand, locale, id) {
			const h = held.get(id);
			if (h === undefined || h.entry.brand !== brand || h.entry.locale !== locale) return [];
			return h.chunks.map((text) => ({ source: sourceOf(h.entry), text, score: 1 }));
		},
		search({ query, brand, locale, topK }) {
			return index(brand, locale)
				.search(query, topK)
				.map((hit) => ({ ...hit.value, score: hit.score }));
		},
	};
}
