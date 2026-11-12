import type { AiSettings } from "@psi/cms-client";
import type {
	Embedder,
	IngestReport,
	KnowledgeEntryInput,
	KnowledgeStore,
	Passage,
} from "@psi/knowledge";
import type { Brand } from "../authz/types";
import { env } from "../env";

/**
 * The guide's own index, as the CMS writes it: the same `@psi/knowledge` store the sites search
 * (Chroma at CHROMA_URL, else LibSQL at PSI_KNOWLEDGE_DB_URL), with the embedder the brand's AI
 * settings name, so the site finds what the CMS wrote in the vector space it searches. Embeddings
 * switched off, no OPENROUTER_API_KEY, or OpenRouter failing: the lexical embedder (no network),
 * reported as `lexical` — the sites' lexical tier (BM25 over the store's mirror) still answers.
 */
export interface IndexOutcome {
	report: IngestReport;
	/** True when the entries went into the lexical space (by choice or by fall-back). */
	lexical: boolean;
	/** `openrouter (openai/text-embedding-3-small)` or `lexical (lexical-hash-v1-1024)`. */
	embedder: string;
	/** The vector space written to (part of the no-op fingerprint). */
	space: string;
	/** Why it fell back to lexical, when it did (no content, no secret). */
	fallback: string | null;
}

export interface SourceIndex {
	/** The space a run would write to first (before any fall-back). */
	primarySpace(): string;
	ingest(entries: ReadonlyArray<KnowledgeEntryInput>): Promise<IndexOutcome>;
	remove(ids: ReadonlyArray<string>): Promise<void>;
	/** The brand's semantic search with the configured embedder (never a chat model). */
	search(q: { query: string; locale: "ro" | "en"; topK: number }): Promise<ReadonlyArray<Passage>>;
	/** The store underneath (for the mirror the test-retrieval box builds). */
	readonly store: KnowledgeStore;
}

export class IndexNotConfigured extends Error {
	constructor() {
		super("the knowledge store is not configured (CHROMA_URL or PSI_KNOWLEDGE_DB_URL)");
		this.name = "IndexNotConfigured";
	}
}

const stores = new Map<string, Promise<KnowledgeStore>>();

async function storeWith(key: string, embedder: () => Promise<Embedder>): Promise<KnowledgeStore> {
	let s = stores.get(key);
	if (s === undefined) {
		s = (async () => {
			const { createKnowledge } = await import("@psi/knowledge");
			const url = env().PSI_KNOWLEDGE_DB_URL;
			if (url === undefined && (process.env.CHROMA_URL ?? "") === "")
				throw new IndexNotConfigured();
			return createKnowledge({ ...(url === undefined ? {} : { url }), embedder: await embedder() });
		})();
		// A failed open is not cached: the next run tries again.
		s.catch(() => stores.delete(key));
		stores.set(key, s);
	}
	return s;
}

async function lexicalStore(): Promise<KnowledgeStore> {
	return storeWith("lexical", async () => (await import("@psi/knowledge")).createLexicalEmbedder());
}

function openRouterKey(): string | undefined {
	const k = process.env.OPENROUTER_API_KEY?.trim();
	return k === undefined || k === "" ? undefined : k;
}

const describe = (s: KnowledgeStore): string => `${s.embedder.kind} (${s.embedder.model})`;

/** One brand's index with the settings in force (read by the caller from `ai-settings`). */
export async function sourceIndex(brand: Brand, settings: AiSettings): Promise<SourceIndex> {
	const key = openRouterKey();
	const semantic =
		settings.embeddings === "openrouter" && key !== undefined
			? await storeWith(`openrouter:${settings.embedModel}`, async () => {
					const k = await import("@psi/knowledge");
					return k.createOpenRouterEmbedder({
						apiKey: key,
						model: settings.embedModel,
						dataCollection: k.readDataCollection(process.env),
					});
				})
			: null;
	const lexical = await lexicalStore();
	const primary = semantic ?? lexical;
	return {
		store: primary,
		primarySpace: () => primary.embedder.space,
		async ingest(entries) {
			if (semantic !== null) {
				try {
					const report = await semantic.ingest(entries);
					return {
						report,
						lexical: false,
						embedder: describe(semantic),
						space: semantic.embedder.space,
						fallback: null,
					};
				} catch (error) {
					const { ChromaAccessError } = await import("@psi/knowledge");
					// The store itself refused: falling back would fail the same way.
					if (error instanceof ChromaAccessError) throw error;
					const report = await lexical.ingest(entries);
					const why =
						error instanceof Error ? `${error.name}: ${error.message}` : "embedding failed";
					return {
						report,
						lexical: true,
						embedder: describe(lexical),
						space: lexical.embedder.space,
						fallback: why.slice(0, 300),
					};
				}
			}
			const report = await lexical.ingest(entries);
			return {
				report,
				lexical: true,
				embedder: describe(lexical),
				space: lexical.embedder.space,
				fallback:
					key === undefined && settings.embeddings === "openrouter"
						? "OPENROUTER_API_KEY is not set"
						: null,
			};
		},
		// Ingest and remove reach every index the package owns, whichever embedder opened them.
		remove: (ids) => lexical.remove(ids),
		search: ({ query, locale, topK }) => primary.search({ query, brand, locale, topK }),
	};
}
