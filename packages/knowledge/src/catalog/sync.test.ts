import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLexicalEmbedder } from "../embedder/lexical";
import { createKnowledge, type KnowledgeStore } from "../knowledge";
import type { StoredEntry } from "../store/stored";
import { entry } from "../testing/entries";
import { storeCases, type TestStore } from "../testing/stores";
import { createCatalog } from "./catalog";
import { createCatalogSync } from "./sync";

const lexical = createLexicalEmbedder();
const LONG = Array.from({ length: 400 }, (_, i) => `Fraza ${i} despre evaluare.`).join(" ");

for (const store of await storeCases()) {
	const title = store.skip === null ? store.name : `${store.name} (skipped: ${store.skip})`;

	describe.skipIf(store.skip !== null)(`stored entries and the catalog mirror: ${title}`, () => {
		let ts: TestStore;
		let k: KnowledgeStore;

		beforeEach(async () => {
			ts = await store.open();
			k = createKnowledge({ vector: ts.vector, embedder: lexical });
		});

		afterEach(async () => {
			await k.close();
			await ts.cleanup();
		});

		it("rebuilds every retrievable entry of the brand from its rows, chunks in order", async () => {
			await k.ingest([
				entry({ id: "long", body: LONG, hub: "anxiety" }),
				entry({ id: "cite", body: "Program: luni-vineri.", url: "cite:src-1#page=2" }),
				entry({ id: "draft", body: "Ciornă.", status: "draft" }),
				entry({ id: "other", body: "Alt brand.", brand: "hemisync" }),
			]);
			const stored = await k.stored("psizone");
			expect(stored.map((s) => s.entry.id)).toEqual(["cite", "long"]);
			const long = stored.find((s) => s.entry.id === "long");
			expect(long?.chunks.length).toBeGreaterThan(1);
			expect(long?.entry.hub).toBe("anxiety");
			expect(stored.find((s) => s.entry.id === "cite")?.entry.url).toBe("cite:src-1#page=2");
		});

		it("a second process mirrors what the first wrote, and drops what it removed", async () => {
			const writer = createKnowledge({ vector: ts.vector, embedder: lexical });
			const catalog = createCatalog();
			await catalog.add([entry({ id: "seed-a", body: "Telefonul centrului." })]);
			const sync = createCatalogSync({ source: k, catalog, keep: (id) => id === "seed-a" });

			await writer.ingest([entry({ id: "cms.src.1.000", body: "Programul de vineri: 9-13." })]);
			await sync.refresh("psizone");
			const hit = catalog.search({ query: "vineri", brand: "psizone", locale: "ro", topK: 5 });
			expect(hit.map((p) => p.source.id)).toEqual(["cms.src.1.000"]);

			await writer.remove(["cms.src.1.000"]);
			await sync.refresh("psizone");
			expect(catalog.search({ query: "vineri", brand: "psizone", locale: "ro", topK: 5 })).toEqual(
				[],
			);
			// The code-held seed stays, though the store never held it.
			expect(catalog.items("psizone", "ro").map((i) => i.id)).toEqual(["seed-a"]);
			await writer.close();
		});
	});
}

describe("createCatalogSync", () => {
	const stored = (id: string, text: string): StoredEntry => ({
		entry: {
			id,
			brand: "psizone",
			locale: "ro",
			kind: "operational",
			title: id,
			url: "/x",
			body: text,
			status: "published",
			reviewedBy: null,
			reviewedAt: null,
		},
		chunks: [text],
	});

	it("is fresh within the TTL, keeps the last good mirror on a failure, never waits on a stale one", async () => {
		let t = 0;
		let calls = 0;
		let mode: "ok" | "fail" | "hang" = "ok";
		const errors: string[] = [];
		const catalog = createCatalog();
		const sync = createCatalogSync({
			catalog,
			keep: () => false,
			ttlMs: 100,
			deadlineMs: 20,
			now: () => t,
			onError: (_b, e) => errors.push(String(e)),
			source: {
				async stored() {
					calls += 1;
					if (mode === "fail") throw new Error("down");
					if (mode === "hang") return new Promise<never>(() => {});
					return [stored("a", "luni deschis")];
				},
			},
		});
		await sync.fresh("psizone");
		await sync.fresh("psizone");
		expect(calls).toBe(1);
		expect(catalog.items("psizone", "ro").map((i) => i.id)).toEqual(["a"]);

		t = 200;
		mode = "fail";
		// Past the TTL with a mirror in hand: the refresh runs in the background, the search goes on.
		await sync.fresh("psizone");
		await vi.waitFor(() => expect(errors).toEqual(["Error: down"]));
		expect(catalog.items("psizone", "ro").map((i) => i.id)).toEqual(["a"]);

		t = 400;
		mode = "hang";
		const started = Date.now();
		await sync.fresh("psizone");
		expect(Date.now() - started).toBeLessThan(1000);
		expect(catalog.items("psizone", "ro").map((i) => i.id)).toEqual(["a"]);
	});

	it("waits at most the deadline only for the first mirror", async () => {
		const catalog = createCatalog();
		const sync = createCatalogSync({
			catalog,
			keep: () => false,
			deadlineMs: 20,
			source: { stored: () => new Promise<never>(() => {}) },
		});
		const started = Date.now();
		await sync.fresh("psizone");
		expect(Date.now() - started).toBeLessThan(1000);
	});

	it("mirror leaves another brand and kept ids alone", async () => {
		const catalog = createCatalog();
		await catalog.add([
			{ ...stored("seed", "x").entry },
			{ ...stored("old", "y").entry },
			{ ...stored("h", "z").entry, brand: "hemisync" },
		]);
		catalog.mirror("psizone", [stored("new", "w"), stored("seed", "twin")], (id) => id === "seed");
		expect(
			catalog
				.items("psizone", "ro")
				.map((i) => i.id)
				.sort(),
		).toEqual(["new", "seed"]);
		expect(catalog.passages("psizone", "ro", "seed")[0]?.text).toBe("x");
		expect(catalog.items("hemisync", "ro").map((i) => i.id)).toEqual(["h"]);
	});
});
