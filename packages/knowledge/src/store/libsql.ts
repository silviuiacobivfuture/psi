import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LibSQLVector } from "@mastra/libsql";
import { isOwnIndex } from "./indexes";
import type { VectorStore } from "./types";

/** A libsql store as parsed by `LibSQLConfigSchema`. */
export interface LibSQLStoreConfig {
	url: string;
	authToken?: string;
}

/** Creates the parent directory of a local `file:` database so a first run just works. */
function ensureLocalDir(url: string): void {
	if (!url.startsWith("file:")) return;
	const path = url.startsWith("file://") ? fileURLToPath(url) : url.slice("file:".length);
	if (path === "" || path === ":memory:") return;
	mkdirSync(dirname(path), { recursive: true });
}

/** Mastra's LibSQL vector store for this config (tests use it to write rows directly). */
export function createLibSQLVector(config: LibSQLStoreConfig, id = "psi-knowledge"): LibSQLVector {
	ensureLocalDir(config.url);
	return new LibSQLVector({
		id,
		url: config.url,
		...(config.authToken === undefined ? {} : { authToken: config.authToken }),
	});
}

/** The vector store port over LibSQL: metadata is stored as JSON, nulls included. */
export function libsqlStore(config: LibSQLStoreConfig): VectorStore {
	const store = createLibSQLVector(config);
	return {
		info: { kind: "libsql", location: config.url.split("?")[0] ?? config.url },
		vector: store,
		async ownIndexes() {
			return (await store.listIndexes()).filter(isOwnIndex);
		},
		checkIndexName() {
			// `kb_<brand>_<locale>_<space>` is always a valid table name: [a-z0-9_] only.
		},
		async dimension(index) {
			return (await store.describeIndex({ indexName: index })).dimension;
		},
		async createIndex(index, dimension) {
			await store.createIndex({ indexName: index, dimension, metric: "cosine" });
		},
		async upsert(index, rows) {
			await store.upsert({
				indexName: index,
				vectors: rows.vectors.map((v) => [...v]),
				metadata: [...rows.metadata],
				ids: [...rows.ids],
			});
		},
		async deleteEntries(index, entryIds) {
			await store.deleteVectors({ indexName: index, filter: { entryId: { $in: [...entryIds] } } });
		},
		async query(index, vector, topK) {
			// minScore 0: LibSQL keeps only rows scoring above it.
			const rows = await store.query({
				indexName: index,
				queryVector: [...vector],
				topK,
				minScore: 0,
			});
			return rows.map((r) => ({ metadata: r.metadata, score: r.score }));
		},
		close: () => store.close(),
	};
}
