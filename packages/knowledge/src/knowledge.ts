import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LibSQLVector } from "@mastra/libsql";
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
import { indexName, isOwnIndex } from "./store/indexes";
import { type ChunkMetadata, chunkId, chunkMetadata, toPassage } from "./store/metadata";

export interface IngestReport {
	/** Which embedder produced the vectors (OpenRouter or the lexical fallback). */
	embedder: EmbedderInfo & { dimension: number | null };
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
	/** Closes the database connection. */
	close(): Promise<void>;
}

export interface CreateKnowledgeOptions {
	/** A libsql URL, e.g. `file:.data/knowledge.db`. */
	url: string;
	/** Defaults to OpenRouter when `OPENROUTER_API_KEY` is set, else the lexical fallback. */
	embedder?: Embedder;
	authToken?: string;
}

const Options = z.object({
	url: z.string().trim().min(1),
	authToken: z.string().min(1).optional(),
});

const EntryIds = z.array(z.string().trim().min(1));

/** Creates the parent directory of a local `file:` database so a first run just works. */
function ensureLocalDir(url: string): void {
	if (!url.startsWith("file:")) return;
	const path = url.startsWith("file://") ? fileURLToPath(url) : url.slice("file:".length);
	if (path === "" || path === ":memory:") return;
	mkdirSync(dirname(path), { recursive: true });
}

interface Prepared {
	entry: KnowledgeEntry;
	index: string;
	texts: ReadonlyArray<string>;
}

export function createKnowledge(opts: CreateKnowledgeOptions): KnowledgeStore {
	const o = Options.parse({ url: opts.url, authToken: opts.authToken });
	const embedder = opts.embedder ?? embedderFromEnv();
	ensureLocalDir(o.url);
	const store = new LibSQLVector({
		id: "psi-knowledge",
		url: o.url,
		...(o.authToken === undefined ? {} : { authToken: o.authToken }),
	});
	const created = new Set<string>();

	async function ownIndexes(): Promise<ReadonlyArray<string>> {
		return (await store.listIndexes()).filter(isOwnIndex);
	}

	async function remove(ids: ReadonlyArray<string>): Promise<void> {
		const parsed = [...new Set(EntryIds.parse(ids))];
		if (parsed.length === 0) return;
		for (const index of await ownIndexes()) {
			await store.deleteVectors({ indexName: index, filter: { entryId: { $in: parsed } } });
		}
	}

	async function ensureIndex(index: string, dimension: number): Promise<void> {
		if (created.has(index)) return;
		const existing = await ownIndexes();
		if (existing.includes(index)) {
			const stats = await store.describeIndex({ indexName: index });
			if (stats.dimension !== dimension) {
				throw new Error(
					`index ${index} holds ${stats.dimension}-dimension vectors, the embedder gives ${dimension}`,
				);
			}
		} else {
			await store.createIndex({ indexName: index, dimension, metric: "cosine" });
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
			await store.upsert({
				indexName: index,
				vectors: group.vectors,
				metadata: group.meta,
				ids: group.ids,
			});
		}
		return {
			embedder: { ...describeEmbedder(embedder), dimension },
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
		const rows = await store.query({
			indexName: index,
			queryVector: vector,
			topK: s.topK,
			minScore: 0,
		});
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
		close: () => store.close(),
	};
}
