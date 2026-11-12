import type { z } from "zod";
import { type Passage, type SearchQuery, SearchQuerySchema } from "../contract";
import type { KnowledgeStore } from "../knowledge";
import type { Catalog } from "./catalog";

/** How one search may retrieve: the runtime settings, per question. */
export interface RetrievalMode {
	/** `lexical` skips embeddings altogether; `auto` uses them while they are healthy. */
	tier: "auto" | "lexical";
	/** Deep search: query variants, a larger topK, semantic and lexical fused (RRF). */
	deep: boolean;
	/** The embedding model to search with; its own indexes must exist. */
	embedModel?: string;
}

/** Why a search fell back to the lexical tier. Never carries the query. */
export interface Degradation {
	stage: "embeddings_degraded" | "index_missing";
	/** The brand whose search fell back. */
	brand: string;
	error: string;
}

export interface BreakerOptions {
	/** Consecutive failures (errors or timeouts) that open the breaker. */
	failures?: number;
	/** How long it stays open before one probe is let through (half-open). */
	openMs?: number;
	/** One semantic search's deadline. */
	timeoutMs?: number;
	now?: () => number;
}

export interface TieredSearchOptions {
	/** The semantic store for an embedding model (undefined: none, e.g. no key). */
	semantic: (embedModel: string | undefined) => KnowledgeStore | undefined;
	catalog: Catalog;
	breaker?: BreakerOptions;
	onDegraded?: (degradation: Degradation) => void;
}

/** One search: the knowledge query, and how it may retrieve. */
export type TieredQuery = z.input<typeof SearchQuerySchema> & { mode?: RetrievalMode };

export type TieredSearch = (q: TieredQuery) => Promise<ReadonlyArray<Passage>>;

/** The breaker's state, for tests and diagnostics. */
export type BreakerState = "closed" | "open" | "half-open";

export interface Tiered {
	search: TieredSearch;
	breaker(): BreakerState;
}

const RRF_K = 60;
const PER_SOURCE = 2;

function describe(error: unknown): string {
	return (error instanceof Error ? `${error.name}: ${error.message}` : "unknown error").slice(
		0,
		300,
	);
}

function timeout<T>(work: Promise<T>, ms: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error(`semantic search timed out after ${ms} ms`)),
			ms,
		);
		work.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error: unknown) => {
				clearTimeout(timer);
				reject(error);
			},
		);
	});
}

/** The query without diacritics: Romanian typed without them meets text written with them. */
function folded(query: string): string {
	return query.normalize("NFD").replace(/\p{M}/gu, "");
}

const keyOf = (p: Passage): string => `${p.source.id}\u0000${p.text}`;

/** Reciprocal rank fusion of ranked lists, at most `PER_SOURCE` passages per source. */
export function fuse(
	lists: ReadonlyArray<ReadonlyArray<Passage>>,
	topK: number,
): ReadonlyArray<Passage> {
	const scores = new Map<string, { passage: Passage; score: number }>();
	for (const list of lists) {
		list.forEach((p, rank) => {
			const k = keyOf(p);
			const held = scores.get(k);
			const add = 1 / (RRF_K + rank + 1);
			scores.set(k, { passage: held?.passage ?? p, score: (held?.score ?? 0) + add });
		});
	}
	const perSource = new Map<string, number>();
	const out: Array<Passage> = [];
	for (const { passage, score } of [...scores.values()].sort((a, b) => b.score - a.score)) {
		const n = perSource.get(passage.source.id) ?? 0;
		if (n >= PER_SOURCE) continue;
		perSource.set(passage.source.id, n + 1);
		out.push({ ...passage, score });
		if (out.length >= topK) break;
	}
	return out;
}

/**
 * Retrieval in tiers, behind one search:
 * - **semantic** (embeddings healthy): the vector store; in deep mode, the query and its folded
 *   variant at three times the topK, fused with the lexical hits (reciprocal rank fusion, at most
 *   two passages per source);
 * - **lexical** (embeddings switched off, failing, or the model's index missing): BM25 over the
 *   catalog's chunks, under the same retrievability rule.
 *
 * A circuit breaker guards the embedder: after `failures` consecutive errors or timeouts it opens
 * for `openMs` and every search is lexical; then one probe is let through (half-open), and a
 * success closes it. Each fall-back is reported through `onDegraded`, never with the query.
 */
export function createTieredSearch(opts: TieredSearchOptions): Tiered {
	const maxFailures = opts.breaker?.failures ?? 3;
	const openMs = opts.breaker?.openMs ?? 30_000;
	const timeoutMs = opts.breaker?.timeoutMs ?? 4_000;
	const now = opts.breaker?.now ?? Date.now;
	let failures = 0;
	let openUntil = 0;
	let probing = false;
	const missingReported = new Set<string>();

	const state = (): BreakerState => {
		if (failures < maxFailures) return "closed";
		return now() >= openUntil ? "half-open" : "open";
	};
	const degrade = (d: Degradation): void => {
		try {
			opts.onDegraded?.(d);
		} catch {
			// A failing log hook must not change the answer.
		}
	};

	const semanticSearch = async (
		store: KnowledgeStore,
		q: SearchQuery,
	): Promise<ReadonlyArray<Passage> | undefined> => {
		const s = state();
		if (s === "open" || (s === "half-open" && probing)) return undefined;
		probing = s === "half-open";
		try {
			const found = await timeout(store.search(q), timeoutMs);
			failures = 0;
			return found;
		} catch (error) {
			failures += 1;
			if (failures >= maxFailures) openUntil = now() + openMs;
			degrade({ stage: "embeddings_degraded", brand: q.brand, error: describe(error) });
			return undefined;
		} finally {
			probing = false;
		}
	};

	const search: TieredSearch = async (raw) => {
		const mode = raw.mode ?? { tier: "auto", deep: false };
		const q = SearchQuerySchema.parse(raw);
		if (q.query === "") return [];
		const lexical = (topK: number): ReadonlyArray<Passage> =>
			opts.catalog.search({ query: q.query, brand: q.brand, locale: q.locale, topK });
		const store = mode.tier === "lexical" ? undefined : opts.semantic(mode.embedModel);
		if (store === undefined) return lexical(q.topK);
		let indexed: boolean;
		try {
			indexed = await store.indexed(q.brand, q.locale);
		} catch (error) {
			degrade({ stage: "embeddings_degraded", brand: q.brand, error: describe(error) });
			return lexical(q.topK);
		}
		if (!indexed) {
			const missing = `${store.embedder.space}/${q.brand}/${q.locale}`;
			if (!missingReported.has(missing)) {
				missingReported.add(missing);
				degrade({
					stage: "index_missing",
					brand: q.brand,
					error: `no index for ${q.brand}/${q.locale} with ${store.embedder.model}: re-ingest to build it`,
				});
			}
			return lexical(q.topK);
		}
		if (!mode.deep) return (await semanticSearch(store, q)) ?? lexical(q.topK);
		const wide = Math.min(q.topK * 3, 50);
		const variants = [...new Set([q.query, folded(q.query)])];
		const lists: Array<ReadonlyArray<Passage>> = [];
		for (const query of variants) {
			const found = await semanticSearch(store, { ...q, query, topK: wide });
			if (found === undefined) break;
			lists.push(found);
		}
		lists.push(lexical(wide));
		return fuse(lists, q.topK);
	};

	return { search, breaker: state };
}
