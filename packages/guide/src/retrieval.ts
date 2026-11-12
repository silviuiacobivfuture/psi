import {
	type Catalog,
	chromaFromEnv,
	createCatalog,
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
}

export interface PsiRetrievalOptions {
	demo: boolean;
	apiKey: string | undefined;
	dataCollection: DataCollection;
	onDegraded: (degradation: Degradation) => void;
}

/**
 * The tiered search over a `@psi/knowledge` store. The catalog (the lexical tier and the agent's
 * catalog tools) holds the store's own catalog when it keeps one, else a new one; either way it is
 * seeded with the seed, and with the demo when `PSI_DEMO_KNOWLEDGE=true`, and every ingest through
 * the workflow adds to it. Another embedding model (the admin's `embedModel`) gets its own store
 * on the same vector database, opened on first use; its indexes exist only after a re-ingest, and
 * until then the search is lexical (`index_missing`).
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
	const tiered = createTieredSearch({
		semantic: (model) => (model === undefined ? store : storeFor(model)),
		catalog,
		onDegraded: opts.onDegraded,
	});
	return { tiered, catalog, ready };
}
