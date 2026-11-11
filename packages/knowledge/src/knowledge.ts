import { z } from "zod";
import { chunkMarkdown } from "./chunk";
import {
	type Brand,
	type Knowledge,
	type Locale,
	type Passage,
	SearchQuerySchema,
} from "./contract";
import { embedderFromEnv } from "./embedder/select";
import { describeEmbedder, type Embedder, type EmbedderInfo } from "./embedder/types";
import {
	type KnowledgeEntry,
	type KnowledgeEntryInput,
	KnowledgeEntrySchema,
	retrievability,
} from "./entry";
import { resolveVectorConfig, type VectorConfig } from "./store/config";
import { indexName } from "./store/indexes";
import { type ChunkMetadata, chunkId, chunkMetadata, toPassage } from "./store/metadata";
import { openVectorStore } from "./store/open";
import type { VectorStoreInfo } from "./store/types";

export interface IngestReport {
	/** Which embedder produced the vectors (OpenRouter or the lexical fallback). */
	embedder: EmbedderInfo & { dimension: number | null };
	/** Which vector store holds the index (LibSQL or Chroma) and where; no secrets. */
	store: VectorStoreInfo;
	/** Entries now retrievable, with the index they live in and their chunk count. */
	indexed: ReadonlyArray<{ id: string; index: string; chunks: number }>;
	/** Entries refused by the retrievability rule; any earlier copy of them was removed. */
	skipped: ReadonlyArray<{ id: string; reason: "draft" | "clinical-unreviewed" }>;
	/** Total chunks written. */
	chunks: number;
}

export interface KnowledgeStore extends Knowledge {
	/** Indexes the retrievable entries; re-ingesting an id replaces it, wherever it was before. */
	ingest(entries: ReadonlyArray<KnowledgeEntryInput>): Promise<IngestReport>;
	/** Removes every chunk of these entries from every index this package owns. */
	remove(ids: ReadonlyArray<string>): Promise<void>;
	/** The embedder in use. */
	readonly embedder: EmbedderInfo;
	/** The vector store in use (LibSQL or Chroma) and where; no secrets. */
	readonly store: VectorStoreInfo;
	/** Closes the database connection (a no-op on Chroma, which holds none). */
	close(): Promise<void>;
}

export interface CreateKnowledgeOptions {
	/**
	 * A libsql URL, e.g. `file:.data/knowledge.db`: the store when neither `vector` nor
	 * `CHROMA_URL` names another one.
	 */
	url?: string;
	/** Defaults to OpenRouter when `OPENROUTER_API_KEY` is set, else the lexical fallback. */
	embedder?: Embedder;
	/** The libsql auth token, with `url`. */
	authToken?: string;
	/**
	 * The vector store, explicitly. Without it: Chroma when `CHROMA_URL` is set (see
	 * `chromaFromEnv`), else LibSQL at `url`.
	 */
	vector?: VectorConfig;
}

const EntryIds = z.array(z.string().trim().min(1));

interface Prepared {
	entry: KnowledgeEntry;
	index: string;
	texts: ReadonlyArray<string>;
}

export function createKnowledge(opts: CreateKnowledgeOptions): KnowledgeStore {
	const store = openVectorStore(resolveVectorConfig(opts));
	const embedder = opts.embedder ?? embedderFromEnv();
	const created = new Set<string>();

	function ownIndexes(): Promise<ReadonlyArray<string>> {
		return store.ownIndexes();
	}

	async function remove(ids: ReadonlyArray<string>): Promise<void> {
		const parsed = [...new Set(EntryIds.parse(ids))];
		if (parsed.length === 0) return;
		for (const index of await ownIndexes()) {
			await store.deleteEntries(index, parsed);
		}
	}

	async function ensureIndex(index: string, dimension: number): Promise<void> {
		if (created.has(index)) return;
		store.checkIndexName(index);
		const existing = await ownIndexes();
		if (existing.includes(index)) {
			const held = await store.dimension(index);
			if (held !== dimension) {
				throw new Error(
					`index ${index} holds ${held}-dimension vectors, the embedder gives ${dimension}`,
				);
			}
		} else {
			await store.createIndex(index, dimension);
		}
		created.add(index);
	}

	async function ingest(input: ReadonlyArray<KnowledgeEntryInput>): Promise<IngestReport> {
		const entries = z.array(KnowledgeEntrySchema).parse(input);
		const seen = new Set<string>();
		for (const e of entries) {
			if (seen.has(e.id)) throw new Error(`duplicate entry id in one ingest: ${e.id}`);
			seen.add(e.id);
		}

		const skipped: Array<{ id: string; reason: "draft" | "clinical-unreviewed" }> = [];
		const prepared: Prepared[] = [];
		for (const entry of entries) {
			const r = retrievability(entry);
			if (!r.retrievable) {
				skipped.push({ id: entry.id, reason: r.reason });
				continue;
			}
			const texts = await chunkMarkdown(entry.body);
			prepared.push({ entry, index: indexName(entry.brand, entry.locale, embedder.space), texts });
		}

		// Embed before touching the store, so a failed embedding never removes live content.
		const inputs = prepared.flatMap((p) => p.texts.map((t) => `${p.entry.title}\n\n${t}`));
		const vectors = inputs.length === 0 ? [] : await embedder.embed(inputs);
		if (vectors.length !== inputs.length) {
			throw new Error(`embedder returned ${vectors.length} vectors for ${inputs.length} chunks`);
		}
		const dimension = vectors[0]?.length ?? null;

		const byIndex = new Map<
			string,
			{ ids: string[]; vectors: number[][]; meta: ChunkMetadata[] }
		>();
		const indexed: Array<{ id: string; index: string; chunks: number }> = [];
		let cursor = 0;
		for (const p of prepared) {
			const group = byIndex.get(p.index) ?? { ids: [], vectors: [], meta: [] };
			p.texts.forEach((text, i) => {
				const v = vectors[cursor];
				cursor += 1;
				if (v === undefined) throw new Error("embedding missing for a chunk");
				group.ids.push(chunkId(p.entry.id, i));
				group.vectors.push(v);
				group.meta.push(chunkMetadata(p.entry, i, text));
			});
			byIndex.set(p.index, group);
			indexed.push({ id: p.entry.id, index: p.index, chunks: p.texts.length });
		}
		// Indexes are created and their dimension checked before anything is removed.
		for (const [index, group] of byIndex) {
			if (group.vectors.length > 0 && dimension !== null) await ensureIndex(index, dimension);
		}
		await remove(entries.map((e) => e.id));
		for (const [index, group] of byIndex) {
			if (group.vectors.length === 0) continue;
			await store.upsert(index, { ids: group.ids, vectors: group.vectors, metadata: group.meta });
		}
		return {
			embedder: { ...describeEmbedder(embedder), dimension },
			store: store.info,
			indexed,
			skipped,
			chunks: inputs.length,
		};
	}

	async function search(q: {
		query: string;
		brand: Brand;
		locale: Locale;
		topK?: number;
	}): Promise<ReadonlyArray<Passage>> {
		const s = SearchQuerySchema.parse(q);
		if (s.query === "") return [];
		const index = indexName(s.brand, s.locale, embedder.space);
		if (!(await ownIndexes()).includes(index)) return [];
		const [vector] = await embedder.embed([s.query]);
		// A query with no usable tokens has no direction: cosine is undefined, so nothing matches.
		if (vector === undefined || vector.every((x) => x === 0)) return [];
		const rows = await store.query(index, vector, s.topK);
		const out: Passage[] = [];
		for (const row of rows) {
			const p = toPassage(row.metadata, row.score, { brand: s.brand, locale: s.locale });
			if (p !== null) out.push(p);
		}
		return out;
	}

	return {
		search,
		ingest,
		remove,
		embedder: describeEmbedder(embedder),
		store: store.info,
		close: () => store.close(),
	};
}
