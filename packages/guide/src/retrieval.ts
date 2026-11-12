import {
	type Brand,
	type Catalog,
	type CatalogSync,
	chromaFromEnv,
	createCatalog,
	createCatalogSync,
	createKnowledge,
	createOpenRouterEmbedder,
	createTieredSearch,
	type DataCollection,
	DEMO,
	type Degradation,
	type KnowledgeStore,
	SEED,
	type Tiered,
} from "@psi/knowledge";

/** psi's retrieval over one knowledge store: the tiers, the catalog behind them, and its seeding. */
export interface PsiRetrieval {
	tiered: Tiered;
	catalog: Catalog;
	/** Settles once the seed (and the demo, when on) is in the catalog. */
	ready: Promise<void>;
	/** Mirrors the store into the catalog (what other processes, the CMS, indexed or removed). */
	sync: CatalogSync;
}

export interface PsiRetrievalOptions {
	demo: boolean;
	apiKey: string | undefined;
	dataCollection: DataCollection;
	onDegraded: (degradation: Degradation) => void;
	/** The catalog could not be refreshed from the store; the last good mirror is used. */
	onSyncFailed?: (brand: Brand, error: string) => void;
}

/**
 * The tiered search over a `@psi/knowledge` store. The catalog (the lexical tier and the agent's
 * catalog tools) holds the store's own catalog when it keeps one, else a new one; either way it is
 * seeded with the seed, and with the demo when `PSI_DEMO_KNOWLEDGE=true`, and every ingest through
 * the workflow adds to it. Another embedding model (the admin's `embedModel`) gets its own store
 * on the same vector database, opened on first use; its indexes exist only after a re-ingest, and
 * until then the search is lexical (`index_missing`). The catalog also mirrors the store (TTL
 * 15 s), so what the CMS indexes or removes reaches the lexical tier and the catalog tools of a
 * site that never ingested it, and survives the site's restart.
 */
export function psiRetrieval(store: KnowledgeStore, opts: PsiRetrievalOptions): PsiRetrieval {
	const catalog = store.catalog ?? createCatalog();
	const ready = catalog.add([...SEED, ...(opts.demo ? DEMO : [])]).catch(() => undefined);
	const others = new Map<string, KnowledgeStore>();
	const storeFor = (model: string): KnowledgeStore => {
		if (model === store.embedder.model || store.embedder.kind !== "openrouter") return store;
		const apiKey = opts.apiKey;
		if (apiKey === undefined) return store;
		const vector = store.store.kind === "chroma" ? (chromaFromEnv() ?? undefined) : undefined;
		// A Chroma store named only in code (no CHROMA_URL) cannot be reopened for another model.
		if (store.store.kind === "chroma" && vector === undefined) return store;
		let other = others.get(model);
		if (other === undefined) {
			other = createKnowledge({
				...(vector === undefined ? { url: store.store.location } : { vector }),
				embedder: createOpenRouterEmbedder({ apiKey, model, dataCollection: opts.dataCollection }),
			});
			others.set(model, other);
		}
		return other;
	};
	const codeHeld = new Set([...SEED, ...DEMO].map((e) => e.id));
	const sync = createCatalogSync({
		source: store,
		catalog,
		keep: (id) => codeHeld.has(id),
		onError: (brand, error) =>
			opts.onSyncFailed?.(
				brand,
				`catalog sync: ${error instanceof Error ? error.message : "unknown error"}`.slice(0, 300),
			),
	});
	const inner = createTieredSearch({
		semantic: (model) => (model === undefined ? store : storeFor(model)),
		catalog,
		onDegraded: opts.onDegraded,
	});
	// Every search first brings the brand's mirror up to date (bounded; see createCatalogSync).
	const tiered: Tiered = {
		breaker: inner.breaker,
		async search(q) {
			await ready;
			await sync.fresh(q.brand);
			return inner.search(q);
		},
	};
	return { tiered, catalog, ready, sync };
}
