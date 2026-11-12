import { ChromaVector } from "@mastra/chroma";
import { explainChromaError } from "./chroma-errors";
import { decodeChromaMetadata, encodeChromaMetadata } from "./chroma-metadata";
import type { ChromaAuthHeader, ParsedChromaConfig } from "./config";
import { isOwnIndex } from "./indexes";
import type { VectorStore } from "./types";

/**
 * `ChromaVector.listIndexes()` asks Chroma for one page of collections, and Chroma pages at 100.
 * A full page means some collections may be missing from the list, and a missed `kb_` index
 * would keep a stale copy of an entry, so the store refuses instead of guessing.
 */
export const CHROMA_LIST_PAGE = 100;

/** How many rows one `get` reads while the catalog is rebuilt from a collection. */
const ROWS_PAGE = 300;

/** Where the Chroma server is: the parts `ChromaClient` takes (it has no path prefix). */
export interface ChromaEndpoint {
	ssl: boolean;
	host: string;
	port: number;
	origin: string;
}

/**
 * Parses `CHROMA_URL`: `http(s)://host[:port]`, the port defaulting to 443 or 80. A path,
 * query, fragment or credentials in the URL are refused: the client would drop the path, and
 * a token belongs in `CHROMA_API_KEY`, not in a URL that ends up in reports.
 */
export function chromaEndpoint(url: string): ChromaEndpoint {
	let u: URL;
	try {
		u = new URL(url);
	} catch {
		throw new Error("CHROMA_URL is not a URL");
	}
	if (u.protocol !== "http:" && u.protocol !== "https:") {
		throw new Error(`CHROMA_URL must be http or https, not ${u.protocol}`);
	}
	if (u.username !== "" || u.password !== "") {
		throw new Error("CHROMA_URL must not carry credentials; use CHROMA_API_KEY");
	}
	if (u.pathname !== "/" || u.search !== "" || u.hash !== "") {
		throw new Error("CHROMA_URL must be an origin (no path, query or fragment)");
	}
	const ssl = u.protocol === "https:";
	return {
		ssl,
		host: u.hostname,
		port: u.port === "" ? (ssl ? 443 : 80) : Number(u.port),
		origin: u.origin,
	};
}

const COLLECTION_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,510}[a-zA-Z0-9]$/;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * Chroma's collection-name rules: 3–512 characters from [a-zA-Z0-9._-], starting and ending
 * with a letter or digit, no `..`, and not an IPv4 address.
 */
export function isChromaCollectionName(name: string): boolean {
	return COLLECTION_NAME.test(name) && !name.includes("..") && !IPV4.test(name);
}

/** The token header Chroma (or the proxy in front of it) checks. */
export function chromaAuthHeaders(
	apiKey: string | undefined,
	header: ChromaAuthHeader,
): Record<string, string> | undefined {
	if (apiKey === undefined) return undefined;
	return header === "authorization"
		? { authorization: `Bearer ${apiKey}` }
		: { "x-chroma-token": apiKey };
}

/**
 * Mastra's Chroma vector store for this config (tests use it to write rows directly). The key
 * goes in a header: `ChromaVector`'s own `apiKey` option switches to Chroma Cloud, which is not
 * where a self-hosted server lives.
 */
export function createChromaVector(config: ParsedChromaConfig, id = "psi-knowledge"): ChromaVector {
	const endpoint = chromaEndpoint(config.url);
	const headers = chromaAuthHeaders(config.apiKey, config.authHeader);
	return new ChromaVector({
		id,
		host: endpoint.host,
		port: endpoint.port,
		ssl: endpoint.ssl,
		tenant: config.tenant,
		database: config.database,
		...(headers === undefined ? {} : { headers }),
	});
}

/**
 * The vector store port over Chroma (one collection per index, cosine space). Every call's
 * authentication or connection failure becomes a `ChromaAccessError` naming the setting to fix,
 * so a missing or wrong token reads as configuration, never as empty content.
 */
export function chromaStore(config: ParsedChromaConfig): VectorStore {
	const endpoint = chromaEndpoint(config.url);
	const store = createChromaVector(config);
	const guard = async <T>(run: () => Promise<T>): Promise<T> => {
		try {
			return await run();
		} catch (error) {
			throw explainChromaError(error, endpoint.origin, config.apiKey !== undefined);
		}
	};
	return {
		info: { kind: "chroma", location: `${endpoint.origin}/${config.tenant}/${config.database}` },
		vector: store,
		async ownIndexes() {
			const all = await guard(() => store.listIndexes());
			if (all.length >= CHROMA_LIST_PAGE) {
				throw new Error(
					`Chroma database ${config.database} lists ${all.length} collections, a full page: ` +
						"the list may be incomplete. Give the knowledge base its own database (CHROMA_DATABASE)",
				);
			}
			return all.filter(isOwnIndex);
		},
		checkIndexName(name) {
			if (!isChromaCollectionName(name)) {
				throw new Error(
					`"${name}" is not a valid Chroma collection name: 3–512 of [a-zA-Z0-9._-], ` +
						"starting and ending with a letter or digit",
				);
			}
		},
		async dimension(index) {
			return (await guard(() => store.describeIndex({ indexName: index }))).dimension;
		},
		async describe(index) {
			const d = await guard(() => store.describeIndex({ indexName: index }));
			return { dimension: d.dimension, count: d.count };
		},
		async createIndex(index, dimension) {
			await guard(() => store.createIndex({ indexName: index, dimension, metric: "cosine" }));
		},
		async upsert(index, rows) {
			await guard(() =>
				store.upsert({
					indexName: index,
					vectors: rows.vectors.map((v) => [...v]),
					metadata: rows.metadata.map(encodeChromaMetadata),
					ids: [...rows.ids],
				}),
			);
		},
		async deleteEntries(index, entryIds) {
			await guard(() =>
				store.deleteVectors({ indexName: index, filter: { entryId: { $in: [...entryIds] } } }),
			);
		},
		async rows(index) {
			const collection = await guard(() => store.getCollection({ indexName: index }));
			const out: unknown[] = [];
			for (let offset = 0; ; offset += ROWS_PAGE) {
				const page = await guard(() =>
					collection.get({ limit: ROWS_PAGE, offset, include: ["metadatas"] }),
				);
				for (const m of page.metadatas) out.push(decodeChromaMetadata(m));
				if (page.ids.length < ROWS_PAGE) break;
			}
			return out;
		},
		async query(index, vector, topK) {
			const rows = await guard(() =>
				store.query({ indexName: index, queryVector: [...vector], topK }),
			);
			// Chroma has no score floor: keep what LibSQL keeps, rows scoring above 0.
			return rows
				.filter((r) => r.score > 0)
				.map((r) => ({ metadata: decodeChromaMetadata(r.metadata), score: r.score }));
		},
		// ChromaVector talks HTTP per call and holds no connection to close.
		close: async () => {},
	};
}
