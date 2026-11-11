import { randomBytes } from "node:crypto";
import { chromaAuthHeaders, chromaEndpoint, createChromaVector } from "../store/chroma";
import { encodeChromaMetadata } from "../store/chroma-metadata";
import { ChromaConfigSchema, chromaFromEnv, type VectorConfig } from "../store/config";
import { createLibSQLVector } from "../store/libsql";
import type { VectorStoreKind } from "../store/types";
import { tempDb } from "./temp-db";

/** A row written straight into an index, bypassing ingest (for the search-time rule). */
export interface RawRow {
	id: string;
	vector: number[];
	metadata: { entryId: string; brand: string; locale: string } & Record<string, unknown>;
}

/** One test's own store: a fresh LibSQL file, or a fresh database on the Chroma server. */
export interface TestStore {
	readonly vector: VectorConfig;
	/** Creates the index and writes rows through Mastra's store (Chroma: through our encoder). */
	writeRaw(index: string, dimension: number, rows: ReadonlyArray<RawRow>): Promise<void>;
	/** Rows actually stored in an index (0 when it does not exist). */
	count(index: string): Promise<number>;
	cleanup(): Promise<void>;
}

export interface StoreCase {
	name: VectorStoreKind;
	/** Why this store is skipped, or null when it runs. */
	skip: string | null;
	open(): Promise<TestStore>;
}

function libsqlCase(): StoreCase {
	return {
		name: "libsql",
		skip: null,
		async open() {
			const db = tempDb();
			const vector: VectorConfig = { kind: "libsql", url: db.url };
			async function withStore<T>(
				run: (s: ReturnType<typeof createLibSQLVector>) => Promise<T>,
			): Promise<T> {
				const s = createLibSQLVector({ url: db.url }, "test");
				try {
					return await run(s);
				} finally {
					await s.close();
				}
			}
			return {
				vector,
				writeRaw: (index, dimension, rows) =>
					withStore(async (s) => {
						await s.createIndex({ indexName: index, dimension, metric: "cosine" });
						await s.upsert({
							indexName: index,
							vectors: rows.map((r) => r.vector),
							metadata: rows.map((r) => r.metadata),
							ids: rows.map((r) => r.id),
						});
					}),
				count: (index) =>
					withStore(async (s) =>
						(await s.listIndexes()).includes(index)
							? (await s.describeIndex({ indexName: index })).count
							: 0,
					),
				async cleanup() {
					db.cleanup();
				},
			};
		},
	};
}

/**
 * Single-node Chroma keeps its catalogue in SQLite: deleting a database while another test file
 * writes can answer 500 "database is locked". The test cleanup waits and tries again, a bounded
 * number of times; any other failure is reported as is.
 */
const LOCKED_RETRIES = 20;

/** Chroma's REST admin call for databases; tests isolate themselves in a throwaway database. */
async function chromaDatabase(
	base: { origin: string; tenant: string; headers: Record<string, string> },
	method: "POST" | "DELETE",
	name: string,
): Promise<void> {
	const url = `${base.origin}/api/v2/tenants/${base.tenant}/databases`;
	for (let attempt = 1; ; attempt += 1) {
		const res =
			method === "POST"
				? await fetch(url, {
						method,
						headers: { ...base.headers, "content-type": "application/json" },
						body: JSON.stringify({ name }),
					})
				: await fetch(`${url}/${name}`, { method, headers: base.headers });
		if (res.ok) return;
		const body = (await res.text()).slice(0, 300);
		if (res.status === 500 && body.includes("database is locked") && attempt < LOCKED_RETRIES) {
			await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
			continue;
		}
		throw new Error(`Chroma ${method} database ${name}: HTTP ${res.status} ${body}`);
	}
}

async function chromaCase(env: Record<string, string | undefined>): Promise<StoreCase> {
	const fromEnv = chromaFromEnv(env);
	const unavailable = (skip: string): StoreCase => ({
		name: "chroma",
		skip,
		open: () => Promise.reject(new Error(skip)),
	});
	if (fromEnv === null) return unavailable("CHROMA_URL is not set");
	const config = ChromaConfigSchema.parse(fromEnv);
	const { origin } = chromaEndpoint(config.url);
	const headers = chromaAuthHeaders(config.apiKey, config.authHeader) ?? {};
	try {
		const res = await fetch(`${origin}/api/v2/heartbeat`, {
			headers,
			signal: AbortSignal.timeout(2000),
		});
		if (!res.ok) return unavailable(`Chroma at ${origin} answered HTTP ${res.status}`);
	} catch {
		return unavailable(`Chroma at ${origin} is unreachable`);
	}
	const base = { origin, tenant: config.tenant, headers };
	return {
		name: "chroma",
		skip: null,
		async open() {
			const database = `kbtest_${randomBytes(6).toString("hex")}`;
			await chromaDatabase(base, "POST", database);
			const vector: VectorConfig = { ...config, database };
			const parsed = ChromaConfigSchema.parse(vector);
			const s = createChromaVector(parsed, "test");
			return {
				vector,
				async writeRaw(index, dimension, rows) {
					await s.createIndex({ indexName: index, dimension, metric: "cosine" });
					await s.upsert({
						indexName: index,
						vectors: rows.map((r) => r.vector),
						metadata: rows.map((r) => encodeChromaMetadata(r.metadata)),
						ids: rows.map((r) => r.id),
					});
				},
				async count(index) {
					return (await s.listIndexes()).includes(index)
						? (await s.describeIndex({ indexName: index })).count
						: 0;
				},
				cleanup: () => chromaDatabase(base, "DELETE", database),
			};
		},
	};
}

/**
 * The stores every knowledge test runs against: LibSQL always; Chroma when `CHROMA_URL` is set
 * and the server answers its heartbeat, else skipped with the reason. Nothing is mocked.
 */
export async function storeCases(
	env: Record<string, string | undefined> = process.env,
): Promise<ReadonlyArray<StoreCase>> {
	const chroma = await chromaCase(env);
	if (chroma.skip !== null) {
		process.stderr.write(`[@psi/knowledge] Chroma cases skipped: ${chroma.skip}\n`);
	}
	return [libsqlCase(), chroma];
}
