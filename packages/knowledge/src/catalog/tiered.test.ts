import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLexicalEmbedder } from "../embedder/lexical";
import type { Embedder } from "../embedder/types";
import { createKnowledge, type KnowledgeStore } from "../knowledge";
import { entry } from "../testing/entries";
import { type TempDb, tempDb } from "../testing/temp-db";
import { createBm25, stem } from "./bm25";
import { createCatalog } from "./catalog";
import { createTieredSearch, type Degradation, fuse } from "./tiered";

const ENTRIES = [
	entry({
		id: "phones",
		title: "Telefoanele",
		body: "Ne poți suna la telefon, dimineața.",
		url: "/contact",
	}),
	entry({
		id: "form",
		title: "Formularul de programare",
		body: "Cererea de programare cere numele și un e-mail.",
	}),
	entry({ id: "draft", title: "Ciornă", body: "Programare ascunsă.", status: "draft" }),
	entry({ id: "clinical", title: "Evaluare", body: "Programare clinică.", kind: "clinical" }),
];

/** An embedder whose provider is down; the lexical one's space, so the indexes exist. */
function failing(calls: { n: number }): Embedder {
	const lexical = createLexicalEmbedder();
	return {
		kind: "lexical",
		model: lexical.model,
		space: lexical.space,
		embed: async () => {
			calls.n += 1;
			throw new Error("embeddings provider down");
		},
	};
}

let db: TempDb;
let store: KnowledgeStore;
beforeEach(async () => {
	db = tempDb();
	store = createKnowledge({
		vector: { kind: "libsql", url: db.url },
		embedder: createLexicalEmbedder(),
		catalog: createCatalog(),
	});
	await store.ingest(ENTRIES);
});
afterEach(async () => {
	await store.close();
	db.cleanup();
});

describe("BM25 and the catalog", () => {
	it("stems Romanian and English inflections together", () => {
		expect(stem("programarea")).toBe(stem("programare"));
		expect(stem("telefonul")).toBe(stem("telefon"));
		expect(stem("bookings")).toBe(stem("booking"));
		const index = createBm25([
			{ text: "Ședința de programare", value: "a" },
			{ text: "Something else", value: "b" },
		]);
		expect(index.search("sedinta programari", 5).map((h) => h.value)).toEqual(["a"]);
	});

	it("holds only retrievable entries, kept in step with ingest and remove", async () => {
		const catalog = store.catalog;
		expect(
			catalog
				?.items("psizone", "ro")
				.map((i) => i.id)
				.sort(),
		).toEqual(["form", "phones"]);
		await store.ingest([
			entry({ id: "form", title: "Formularul de programare", body: "Cererea.", status: "draft" }),
		]);
		expect(catalog?.items("psizone", "ro").map((i) => i.id)).toEqual(["phones"]);
		await store.remove(["phones"]);
		expect(catalog?.items("psizone", "ro")).toEqual([]);
	});
});

describe("tiered search", () => {
	it("answers lexically, with the same rule, when embeddings fail; the breaker opens and recovers", async () => {
		const calls = { n: 0 };
		let now = 0;
		const degraded: Array<Degradation> = [];
		const broken = createKnowledge({
			vector: { kind: "libsql", url: db.url },
			embedder: failing(calls),
		});
		const tiered = createTieredSearch({
			semantic: () => broken,
			catalog: store.catalog ?? createCatalog(),
			breaker: { failures: 2, openMs: 1_000, now: () => now },
			onDegraded: (d) => degraded.push(d),
		});
		const ask = () => tiered.search({ query: "telefon", brand: "psizone", locale: "ro" });
		const first = await ask();
		expect(first.map((p) => p.source.id)).toEqual(["phones"]);
		await ask();
		expect(tiered.breaker()).toBe("open");
		await ask();
		expect(calls.n).toBe(2);
		expect(degraded.map((d) => d.stage)).toEqual(["embeddings_degraded", "embeddings_degraded"]);
		expect(JSON.stringify(degraded)).not.toContain("telefon");
		now += 1_000;
		expect(tiered.breaker()).toBe("half-open");
		await ask();
		expect(calls.n).toBe(3);
		expect(tiered.breaker()).toBe("open");
		const healed = createTieredSearch({
			semantic: () => store,
			catalog: store.catalog ?? createCatalog(),
		});
		expect(
			(await healed.search({ query: "telefon", brand: "psizone", locale: "ro" })).length,
		).toBeGreaterThan(0);
		const draftless = await tiered.search({ query: "programare", brand: "psizone", locale: "ro" });
		expect(draftless.length).toBeGreaterThan(0);
		expect(draftless.some((p) => p.source.id === "draft" || p.source.id === "clinical")).toBe(
			false,
		);
	});

	it("goes lexical when switched off or when the model has no index, saying index_missing once", async () => {
		const degraded: Array<Degradation> = [];
		const empty = tempDb();
		const fresh = createKnowledge({
			vector: { kind: "libsql", url: empty.url },
			embedder: createLexicalEmbedder(),
		});
		const tiered = createTieredSearch({
			semantic: (model) => (model === "other/model" ? fresh : store),
			catalog: store.catalog ?? createCatalog(),
			onDegraded: (d) => degraded.push(d),
		});
		const q = { query: "programare", brand: "psizone", locale: "ro" } as const;
		expect(
			(await tiered.search({ ...q, mode: { tier: "lexical", deep: false } })).length,
		).toBeGreaterThan(0);
		await tiered.search({ ...q, mode: { tier: "auto", deep: false, embedModel: "other/model" } });
		await tiered.search({ ...q, mode: { tier: "auto", deep: false, embedModel: "other/model" } });
		expect(degraded.map((d) => d.stage)).toEqual(["index_missing"]);
		await fresh.close();
		empty.cleanup();
	});

	it("deep mode fuses semantic and lexical hits (RRF), at most two passages per source", async () => {
		const tiered = createTieredSearch({
			semantic: () => store,
			catalog: store.catalog ?? createCatalog(),
		});
		const deep = await tiered.search({
			query: "programare telefon",
			brand: "psizone",
			locale: "ro",
			mode: { tier: "auto", deep: true },
		});
		expect(new Set(deep.map((p) => p.source.id))).toEqual(new Set(["form", "phones"]));
		const a = {
			source: { id: "x", title: "x", url: "/x", reviewedBy: null, reviewedAt: null },
			text: "a",
			score: 1,
		};
		const b = { ...a, text: "b" };
		const c = { ...a, text: "c" };
		expect(fuse([[a, b, c], [c]], 5)).toHaveLength(2);
	});
});

describe("the breaker", () => {
	it("closes again after a successful half-open probe", async () => {
		let now = 0;
		let up = false;
		const lexical = createLexicalEmbedder();
		const flaky: Embedder = {
			...lexical,
			embed: (texts) => (up ? lexical.embed(texts) : Promise.reject(new Error("down"))),
		};
		const shaky = createKnowledge({ vector: { kind: "libsql", url: db.url }, embedder: flaky });
		const tiered = createTieredSearch({
			semantic: () => shaky,
			catalog: store.catalog ?? createCatalog(),
			breaker: { failures: 1, openMs: 100, now: () => now },
		});
		const ask = () => tiered.search({ query: "telefon", brand: "psizone", locale: "ro" });
		await ask();
		expect(tiered.breaker()).toBe("open");
		now += 100;
		up = true;
		expect(tiered.breaker()).toBe("half-open");
		expect((await ask()).length).toBeGreaterThan(0);
		expect(tiered.breaker()).toBe("closed");
	});
});
