import { createServer, type IncomingHttpHeaders } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BRANDS, LOCALES } from "../contract";
import { createLexicalEmbedder, lexicalVector } from "../embedder/lexical";
import { openRouterSpace } from "../embedder/openrouter";
import type { Embedder } from "../embedder/types";
import { createKnowledge, type KnowledgeStore } from "../knowledge";
import { entry } from "../testing/entries";
import { storeCases, type TestStore } from "../testing/stores";
import {
	CHROMA_LIST_PAGE,
	chromaAuthHeaders,
	chromaEndpoint,
	chromaStore,
	createChromaVector,
	isChromaCollectionName,
} from "./chroma";
import { ChromaAccessError } from "./chroma-errors";
import { encodeChromaMetadata } from "./chroma-metadata";
import { ChromaConfigSchema, type ParsedChromaConfig } from "./config";
import { indexName } from "./indexes";
import type { ChunkMetadata } from "./metadata";

describe("chromaEndpoint", () => {
	it("defaults the port to 80 for http and 443 for https", () => {
		expect(chromaEndpoint("http://chroma.local")).toEqual({
			ssl: false,
			host: "chroma.local",
			port: 80,
			origin: "http://chroma.local",
		});
		expect(chromaEndpoint("https://chroma.psizone.ro")).toEqual({
			ssl: true,
			host: "chroma.psizone.ro",
			port: 443,
			origin: "https://chroma.psizone.ro",
		});
	});

	it("keeps an explicit port, and accepts a trailing slash", () => {
		expect(chromaEndpoint("http://localhost:8000/")).toMatchObject({
			host: "localhost",
			port: 8000,
		});
	});

	it("refuses a string that is not a URL", () => {
		expect(() => chromaEndpoint("localhost:8000")).toThrow();
		expect(() => chromaEndpoint("not a url")).toThrow(/not a URL/);
	});

	it("refuses a scheme other than http or https", () => {
		expect(() => chromaEndpoint("ftp://chroma.psizone.ro")).toThrow(/http or https/);
	});

	it("refuses credentials in the URL", () => {
		expect(() => chromaEndpoint("https://user:pw@chroma.psizone.ro")).toThrow(/credentials/);
	});

	it("refuses a path", () => {
		expect(() => chromaEndpoint("https://psizone.ro/chroma")).toThrow(/origin/);
	});

	it("refuses a query", () => {
		expect(() => chromaEndpoint("https://chroma.psizone.ro/?token=x")).toThrow(/origin/);
	});

	it("refuses a fragment", () => {
		expect(() => chromaEndpoint("https://chroma.psizone.ro/#x")).toThrow(/origin/);
	});
});

describe("Chroma collection names", () => {
	it("accepts every index name this package makes, for both embedders", () => {
		const spaces = [
			createLexicalEmbedder().space,
			openRouterSpace("openai/text-embedding-3-small"),
		];
		for (const brand of BRANDS) {
			for (const locale of LOCALES) {
				for (const space of spaces) {
					expect(isChromaCollectionName(indexName(brand, locale, space))).toBe(true);
				}
			}
		}
	});

	it("refuses a name ending in an underscore (a space like `lex_`)", () => {
		expect(isChromaCollectionName("kb_psizone_ro_lex_")).toBe(false);
	});

	it("refuses a name starting with something other than a letter or digit", () => {
		expect(isChromaCollectionName("_kb_psizone")).toBe(false);
	});

	it("refuses a name shorter than 3 characters", () => {
		expect(isChromaCollectionName("kb")).toBe(false);
	});

	it("refuses a name longer than 512 characters", () => {
		expect(isChromaCollectionName(`k${"b".repeat(512)}`)).toBe(false);
	});

	it("refuses a character outside [a-zA-Z0-9._-]", () => {
		expect(isChromaCollectionName("kb_psizone/ro")).toBe(false);
	});

	it("refuses two consecutive periods", () => {
		expect(isChromaCollectionName("kb..ro")).toBe(false);
	});

	it("refuses an IPv4 address", () => {
		expect(isChromaCollectionName("10.0.0.1")).toBe(false);
	});

	it("is enforced by the store before Chroma is called", () => {
		const s = chromaStore(ChromaConfigSchema.parse({ kind: "chroma", url: "http://localhost:1" }));
		expect(() => s.checkIndexName("kb_psizone_ro_lex_")).toThrow(/not a valid Chroma collection/);
	});
});

describe("the Chroma token", () => {
	it("is sent as a Bearer token by default, or as X-Chroma-Token", () => {
		expect(chromaAuthHeaders(undefined, "authorization")).toBeUndefined();
		expect(chromaAuthHeaders("k", "authorization")).toEqual({ authorization: "Bearer k" });
		expect(chromaAuthHeaders("k", "x-chroma-token")).toEqual({ "x-chroma-token": "k" });
	});

	it("never appears in the reported store", () => {
		const config = ChromaConfigSchema.parse({
			kind: "chroma",
			url: "https://chroma.psizone.ro",
			apiKey: "very-secret-key",
			database: "knowledge",
		});
		const { info } = chromaStore(config);
		expect(info).toEqual({
			kind: "chroma",
			location: "https://chroma.psizone.ro/default_tenant/knowledge",
		});
		expect(JSON.stringify(info)).not.toContain("very-secret-key");
	});
});

/** A local HTTP listener standing in for the network: records what reaches the server. */
async function listen(): Promise<{
	url: string;
	seen: Array<{ path: string; headers: IncomingHttpHeaders }>;
	close(): Promise<void>;
}> {
	const seen: Array<{ path: string; headers: IncomingHttpHeaders }> = [];
	const server = createServer((req, res) => {
		seen.push({ path: req.url ?? "", headers: req.headers });
		res.writeHead(200, { "content-type": "application/json" });
		res.end("[]");
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (address === null || typeof address === "string") throw new Error("no TCP address");
	return {
		url: `http://127.0.0.1:${address.port}`,
		seen,
		close: () => new Promise<void>((resolve) => server.close(() => resolve())),
	};
}

describe("what reaches the Chroma server", () => {
	it("carries the Bearer token, the tenant and the database on every call", async () => {
		const server = await listen();
		try {
			const s = chromaStore(
				ChromaConfigSchema.parse({
					kind: "chroma",
					url: server.url,
					apiKey: "k1",
					tenant: "psi",
					database: "knowledge",
				}),
			);
			expect(await s.ownIndexes()).toEqual([]);
			expect(server.seen.length).toBeGreaterThan(0);
			for (const r of server.seen) {
				expect(r.headers.authorization).toBe("Bearer k1");
				expect(r.path).toMatch(/^\/api\/v2\/tenants\/psi\/databases\/knowledge\/collections/);
			}
		} finally {
			await server.close();
		}
	});

	it("carries X-Chroma-Token instead when asked, and no Authorization header", async () => {
		const server = await listen();
		try {
			const s = chromaStore(
				ChromaConfigSchema.parse({
					kind: "chroma",
					url: server.url,
					apiKey: "k2",
					authHeader: "x-chroma-token",
				}),
			);
			await s.ownIndexes();
			expect(server.seen.length).toBeGreaterThan(0);
			for (const r of server.seen) {
				expect(r.headers["x-chroma-token"]).toBe("k2");
				expect(r.headers.authorization).toBeUndefined();
			}
		} finally {
			await server.close();
		}
	});
});

/**
 * A local stand-in for the estate's auth sidecar (gitops/services/chroma/base/proxy-config.yaml):
 * 401 with `WWW-Authenticate: Bearer` unless `Authorization: Bearer <token>` or `X-Chroma-Token`
 * carries the token; with it, an empty collection list.
 */
async function sidecar(token: string): Promise<{ url: string; close(): Promise<void> }> {
	const server = createServer((req, res) => {
		const ok =
			req.headers.authorization === `Bearer ${token}` || req.headers["x-chroma-token"] === token;
		if (!ok) {
			res.writeHead(401, {
				"content-type": "application/json",
				"www-authenticate": 'Bearer realm="chroma"',
			});
			res.end('{"error":"Unauthorized","message":"a valid token is required"}\n');
			return;
		}
		res.writeHead(200, { "content-type": "application/json" });
		res.end("[]");
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (address === null || typeof address === "string") throw new Error("no TCP address");
	return {
		url: `http://127.0.0.1:${address.port}`,
		close: () => new Promise<void>((resolve) => server.close(() => resolve())),
	};
}

describe("a Chroma behind the estate's token sidecar", () => {
	const TOKEN = "a".repeat(64);
	let proxy: { url: string; close(): Promise<void> };
	beforeEach(async () => {
		proxy = await sidecar(TOKEN);
	});
	afterEach(async () => {
		await proxy.close();
	});

	const search = (apiKey: string | undefined, authHeader?: "authorization" | "x-chroma-token") =>
		createKnowledge({
			embedder: createLexicalEmbedder(),
			vector: {
				kind: "chroma",
				url: proxy.url,
				...(apiKey === undefined ? {} : { apiKey }),
				...(authHeader === undefined ? {} : { authHeader }),
			},
		}).search({ query: "telefon", brand: "psizone", locale: "ro" });

	it("without a token, search fails as a configuration error naming CHROMA_API_KEY, not as no content", async () => {
		const failed = search(undefined);
		await expect(failed).rejects.toBeInstanceOf(ChromaAccessError);
		await expect(search(undefined)).rejects.toThrow(/HTTP 401\): set CHROMA_API_KEY/);
	});

	it("with a wrong token, it says the token is not the server's, and never prints it", async () => {
		const error = await search("wrong-token").then(
			() => undefined,
			(e: unknown) => e,
		);
		expect(error).toBeInstanceOf(ChromaAccessError);
		expect(String(error)).toMatch(/refused the token \(HTTP 401\)/);
		expect(String(error)).not.toContain("wrong-token");
	});

	it("with the token as Bearer or as X-Chroma-Token, the sidecar lets it through", async () => {
		expect(await search(TOKEN)).toEqual([]);
		expect(await search(TOKEN, "x-chroma-token")).toEqual([]);
	});
});

const chroma = (await storeCases()).find((c) => c.name === "chroma");
const skip = chroma === undefined ? "no Chroma case" : chroma.skip;

describe.skipIf(skip !== null)(
	`against the Chroma server${skip === null ? "" : ` (skipped: ${skip})`}`,
	() => {
		const lexical = createLexicalEmbedder();
		const psizoneRo = indexName("psizone", "ro", lexical.space);
		let ts: TestStore;
		let config: ParsedChromaConfig;
		let k: KnowledgeStore;

		beforeEach(async () => {
			if (chroma === undefined) throw new Error("no Chroma case");
			ts = await chroma.open();
			config = ChromaConfigSchema.parse(ts.vector);
			k = createKnowledge({ vector: ts.vector, embedder: lexical });
		});

		afterEach(async () => {
			await k.close();
			await ts.cleanup();
		});

		it("names collections kb_<brand>_<locale>_<space> and touches no other collection", async () => {
			const raw = createChromaVector(config, "raw");
			await raw.createIndex({ indexName: "someone_elses", dimension: 3, metric: "cosine" });
			await raw.upsert({
				indexName: "someone_elses",
				vectors: [[1, 0, 0]],
				metadata: [{ entryId: "a" }],
				ids: ["a#0"],
			});
			await k.ingest([
				entry({ id: "a", body: "Telefon." }),
				entry({ id: "b", brand: "hemisync", locale: "en", body: "Phone." }),
			]);
			await k.remove(["a"]);
			expect([...(await raw.listIndexes())].sort()).toEqual([
				indexName("hemisync", "en", lexical.space),
				psizoneRo,
				"someone_elses",
			]);
			expect(psizoneRo).toBe("kb_psizone_ro_lex1_1024");
			expect((await raw.describeIndex({ indexName: "someone_elses" })).count).toBe(1);
			expect(k.store).toEqual({
				kind: "chroma",
				location: `${chromaEndpoint(config.url).origin}/${config.tenant}/${config.database}`,
			});
		});

		it("refuses an embedder space Chroma cannot name, before anything is removed", async () => {
			await k.ingest([entry({ id: "a", body: "Telefon." })]);
			const bad: Embedder = {
				kind: lexical.kind,
				model: lexical.model,
				space: "lex_",
				embed: (texts) => lexical.embed(texts),
			};
			const other = createKnowledge({ vector: ts.vector, embedder: bad });
			await expect(other.ingest([entry({ id: "a", body: "Telefon." })])).rejects.toThrow(
				/not a valid Chroma collection name/,
			);
			expect(await ts.count(psizoneRo)).toBe(1);
		});

		it("round-trips metadata with diacritics, review stamp included", async () => {
			const reviewed = {
				id: "psizone-ro-sedinta",
				kind: "clinical" as const,
				title: "Ședință de evaluare — „țară” și școală",
				url: "/copii/adhd",
				reviewedBy: "Dr. Ștefan Țărnă",
				reviewedAt: "2026-10-01",
				body: "Îngrijire și încredere la școală.",
			};
			await k.ingest([entry(reviewed)]);
			const [p] = await k.search({ query: "școală", brand: "psizone", locale: "ro" });
			expect(p?.source).toEqual({
				id: reviewed.id,
				title: reviewed.title,
				url: reviewed.url,
				reviewedBy: reviewed.reviewedBy,
				reviewedAt: reviewed.reviewedAt,
			});
			expect(p?.text).toBe(reviewed.body);
			const stored = await createChromaVector(config, "raw").get({ indexName: psizoneRo });
			expect(stored[0]?.metadata).toMatchObject({
				entryId: reviewed.id,
				brand: "psizone",
				locale: "ro",
			});
		});

		it("overwrites the whole record on upsert: Chroma's metadata merge leaves no stale stamp", async () => {
			const s = chromaStore(config);
			const base: ChunkMetadata = {
				entryId: "m",
				brand: "psizone",
				locale: "ro",
				kind: "operational",
				status: "published",
				title: "Telefon",
				url: "/contact",
				reviewedBy: "Dr. Ana Pop",
				reviewedAt: "2026-10-01",
				chunk: 0,
				text: "Telefon.",
			};
			const vector = lexicalVector("Telefon.");
			await s.createIndex(psizoneRo, vector.length);
			await s.upsert(psizoneRo, { ids: ["m#0"], vectors: [vector], metadata: [base] });
			await s.upsert(psizoneRo, {
				ids: ["m#0"],
				vectors: [vector],
				metadata: [{ ...base, reviewedBy: null, reviewedAt: null }],
			});
			const [p] = await k.search({ query: "telefon", brand: "psizone", locale: "ro" });
			expect(p?.source.reviewedBy).toBeNull();
			expect(p?.source.reviewedAt).toBeNull();
		});

		it("deletes: remove empties the entry's rows and keeps the collection", async () => {
			await k.ingest([
				entry({ id: "a", body: "Telefon a." }),
				entry({ id: "b", body: "Telefon b." }),
			]);
			expect(await ts.count(psizoneRo)).toBe(2);
			await k.remove(["a"]);
			expect(await ts.count(psizoneRo)).toBe(1);
			await k.remove(["b"]);
			expect(await ts.count(psizoneRo)).toBe(0);
			expect(await createChromaVector(config, "raw").listIndexes()).toContain(psizoneRo);
		});

		it("never returns a row whose copied fields disagree with its record", async () => {
			await k.ingest([entry({ id: "a", body: "Telefon." })]);
			const raw = createChromaVector(config, "raw");
			const chunk: ChunkMetadata = {
				entryId: "a",
				brand: "psizone",
				locale: "ro",
				kind: "operational",
				status: "published",
				title: "Telefon",
				url: "/x",
				reviewedBy: null,
				reviewedAt: null,
				chunk: 0,
				text: "Telefon falsificat.",
			};
			const forged = encodeChromaMetadata(chunk);
			await raw.upsert({
				indexName: psizoneRo,
				vectors: [lexicalVector("Telefon.")],
				metadata: [{ ...forged, entryId: "someone-else" }],
				ids: ["forged#0"],
			});
			const passages = await k.search({ query: "telefon", brand: "psizone", locale: "ro" });
			expect(passages.map((p) => p.text)).toEqual(["Telefon."]);
		});

		it(`refuses a database listing a full page (${CHROMA_LIST_PAGE}) of collections`, async () => {
			const raw = createChromaVector(config, "raw");
			for (let i = 0; i < CHROMA_LIST_PAGE; i += 1) {
				await raw.createIndex({ indexName: `filler_${i}`, dimension: 2, metric: "cosine" });
			}
			await expect(k.remove(["a"])).rejects.toThrow(/full page/);
		}, 120_000);
	},
);
