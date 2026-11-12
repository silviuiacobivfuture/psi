export { type Bm25, createBm25, stem, stems } from "./catalog/bm25";
export { type Catalog, type CatalogItem, createCatalog } from "./catalog/catalog";
export {
	type BreakerOptions,
	type BreakerState,
	createTieredSearch,
	type Degradation,
	fuse,
	type RetrievalMode,
	type Tiered,
	type TieredQuery,
	type TieredSearch,
	type TieredSearchOptions,
} from "./catalog/tiered";
export { approxTokens, CHUNK_MAX_TOKENS, CHUNK_OVERLAP_TOKENS, chunkMarkdown } from "./chunk";
export {
	BRANDS,
	type Brand,
	BrandSchema,
	DEFAULT_TOP_K,
	type Knowledge,
	LOCALES,
	type Locale,
	LocaleSchema,
	MAX_TOP_K,
	type Passage,
	type SearchQuery,
	SearchQuerySchema,
	type Source,
} from "./contract";
export {
	DEMO_ID_PREFIX,
	DEMO_REVIEWED_AT,
	DEMO_REVIEWER,
	DEMO_TITLE_PREFIX,
	DEMO_URL_PREFIX,
	type DemoDraft,
	type DemoEntry,
	demoSet,
	isDemoId,
} from "./demo/entry";
export { DEMO, demoEntries } from "./demo/index";
export { ingestSeedAndDemo } from "./demo/ingest";
export {
	createLexicalEmbedder,
	LEXICAL_DIMENSION,
	lexicalTokens,
	lexicalVector,
} from "./embedder/lexical";
export {
	createOpenRouterEmbedder,
	DEFAULT_EMBED_MODEL,
	type OpenRouterEmbedderOptions,
	openRouterSpace,
} from "./embedder/openrouter";
export { embedderFromEnv } from "./embedder/select";
export type { Embedder, EmbedderInfo, EmbedderKind } from "./embedder/types";
export {
	isRetrievable,
	KINDS,
	type Kind,
	KindSchema,
	type KnowledgeEntry,
	type KnowledgeEntryInput,
	KnowledgeEntrySchema,
	type Retrievability,
	type ReviewState,
	retrievability,
	STATUSES,
	type Status,
	StatusSchema,
} from "./entry";
export {
	DATA_COLLECTION_POLICIES,
	type DataCollection,
	type Env,
	isProduction,
	ProductionGuardError,
	readDataCollection,
	readDemoKnowledge,
} from "./env/flags";
export { openRouterKeyFrom } from "./env/key-file";
export {
	type CreateKnowledgeOptions,
	createKnowledge,
	type IngestReport,
	type KnowledgeStore,
} from "./knowledge";
export { SEED } from "./seed/index";
export { ChromaAccessError } from "./store/chroma-errors";
export {
	CHROMA_AUTH_HEADERS,
	type ChromaAuthHeader,
	type ChromaConfig,
	chromaFromEnv,
	type LibSQLConfig,
	resolveVectorConfig,
	type VectorConfig,
} from "./store/config";
export { indexName } from "./store/indexes";
export type { VectorStoreInfo, VectorStoreKind } from "./store/types";
