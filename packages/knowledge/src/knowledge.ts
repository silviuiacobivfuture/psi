import type { MastraVector } from "@mastra/core/vector";
import { z } from "zod";
import type { Catalog } from "./catalog/catalog";
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
import { INDEX_PREFIX, indexName } from "./store/indexes";
import { type ChunkMetadata, chunkId, chunkMetadata, toPassage } from "./store/metadata";
import { openVectorStore } from "./store/open";
import { collectStored, type StoredEntry } from "./store/stored";
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

/** One index as the control plane shows it: `kb_<brand>_<locale>_<space>`, chunks and dimension. */
export interface IndexStat {
	name: string;
	locale: string;
	space: string;
	chunks: number;
	dimension: number;
}

export interface KnowledgeStore extends Knowledge {
	/** Indexes the retrievable entries; re-ingesting an id replaces it, wherever it was before. */
	ingest(entries: ReadonlyArray<KnowledgeEntryInput>): Promise<IngestReport>;
	/** Removes every chunk of these entries from every index this package owns. */
	remove(ids: ReadonlyArray<string>): Promise<void>;
	/** True when this embedder's index for the brand and locale exists (something was ingested). */
	indexed(brand: Brand, locale: Locale): Promise<boolean>;
	/** Every index this package owns for the brand (any embedder space), with its chunk count. */
	indexStats(brand: Brand): Promise<ReadonlyArray<IndexStat>>;
	/**
	 * Every retrievable entry the store holds for the brand (any locale, any embedder space),
	 * rebuilt from its chunks: what a process that did not ingest them mirrors into its catalog.
	 */
	stored(brand: Brand): Promise<ReadonlyArray<StoredEntry>>;
	/** The catalog kept in step with ingest and remove, when one was given. */
	readonly catalog: Catalog | undefined;
	/** The embedder in use. */
	readonly embedder: EmbedderInfo;
	/** The vector store in use (LibSQL or Chroma) and where; no secrets. */
	readonly store: VectorStoreInfo;
	/**
	 * Mastra's vector store underneath (`ChromaVector` or `LibSQLVector`), for registering with a
	 * Mastra instance (`new Mastra({ vectors: { chroma: kb.vector } })`). Searching it directly
	 * skips the retrievability rule; `search` is the way to read content.
	 */
	readonly vector: MastraVector;
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
	/** A catalog to keep in step: every ingest adds its retrievable entries, every remove removes. */
	catalog?: Catalog;
}

const EntryIds = z.array(z.string().trim().min(1));

interface Prepared {
	entry: KnowledgeEntry;
	index: string;
	texts: ReadonlyArray<string>;
}

/** How long a search trusts the list of indexes it last read. */
const INDEXES_TTL_MS = 60_000;
/** Query embeddings kept (most recently used). */
const QUERY_VECTORS = 256;

export function createKnowledge(opts: CreateKnowledgeOptions): KnowledgeStore {
	const store = openVectorStore(resolveVectorConfig(opts));
	const embedder = opts.embedder ?? embedderFromEnv();
	const created = new Set<string>();
	// A search needs to know its index exists, and an embedding of its query: both are remembered
	// for a while, so a turn's searches (and a repeated question) skip the round trips.
	let known: { at: number; indexes: ReadonlyArray<string> } | undefined;
	const vectors = new Map<string, ReadonlyArray<number>>();

	function ownIndexes(): Promise<ReadonlyArray<string>> {
		return store.ownIndexes();
	}

	/** The store's indexes, as of at most `INDEXES_TTL_MS` ago (the store is asked again after). */
	async function knownIndexes(): Promise<ReadonlyArray<string>> {
		if (known !== undefined && Date.now() - known.at < INDEXES_TTL_MS) return known.indexes;
		const indexes = await ownIndexes();
		known = { at: Date.now(), indexes };
		return indexes;
	}

	/** The query's vector, from the cache when the same query (folded) was embedded lately. */
	async function queryVector(query: string): Promise<ReadonlyArray<number> | undefined> {
		const key = `${embedder.space}\u0000${query.trim().toLowerCase()}`;
		const hit = vectors.get(key);
		if (hit !== undefined) {
			vectors.delete(key);
			vectors.set(key, hit);
			return hit;
		}
		const [vector] = await embedder.embed([query]);
		if (vector === undefined) return undefined;
		vectors.set(key, vector);
		const oldest = vectors.keys().next();
		if (vectors.size > QUERY_VECTORS && oldest.done !== true) vectors.delete(oldest.value);
		return vector;
	}

	async function remove(ids: ReadonlyArray<string>): Promise<void> {
		const parsed = [...new Set(EntryIds.parse(ids))];
		if (parsed.length === 0) return;
		for (const index of await ownIndexes()) {
			await store.deleteEntries(index, parsed);
		}
		opts.catalog?.remove(parsed);
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
			known = undefined;
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
		await opts.catalog?.add(entries);
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
		// The index check and the embedding run side by side: each is a round trip.
		const [indexes, vector] = await Promise.all([knownIndexes(), queryVector(s.query)]);
		if (!indexes.includes(index) && !(await ownIndexes()).includes(index)) return [];
		// A query with no usable tokens has no direction: cosine is undefined, so nothing matches.
		if (vector === undefined || vector.every((x) => x === 0)) return [];
		const rows = await store.query(index, [...vector], s.topK);
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
		indexed: async (brand, locale) =>
			(await ownIndexes()).includes(indexName(brand, locale, embedder.space)),
		async indexStats(brand) {
			const prefix = `${INDEX_PREFIX}${brand}_`;
			const names = (await ownIndexes()).filter((n) => n.startsWith(prefix)).sort();
			return Promise.all(
				names.map(async (name) => {
					const [locale = "", ...space] = name.slice(prefix.length).split("_");
					const d = await store.describe(name);
					return { name, locale, space: space.join("_"), chunks: d.count, dimension: d.dimension };
				}),
			);
		},
		async stored(brand) {
			const prefix = `${INDEX_PREFIX}${brand}_`;
			const rows: unknown[] = [];
			for (const name of (await ownIndexes()).filter((n) => n.startsWith(prefix)).sort()) {
				rows.push(...(await store.rows(name)));
			}
			return collectStored(rows, brand);
		},
		catalog: opts.catalog,
		embedder: describeEmbedder(embedder),
		store: store.info,
		vector: store.vector,
		close: () => store.close(),
	};
}
