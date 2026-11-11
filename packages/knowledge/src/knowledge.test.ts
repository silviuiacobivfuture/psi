import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Brand, Locale } from "./contract";
import { createLexicalEmbedder, lexicalVector } from "./embedder/lexical";
import { createKnowledge, type KnowledgeStore } from "./knowledge";
import { indexName } from "./store/indexes";
import { entry } from "./testing/entries";
import { type RawRow, storeCases, type TestStore } from "./testing/stores";

const lexical = createLexicalEmbedder();
const reviewed = { reviewedBy: "Dr. Ana Pop", reviewedAt: "2026-10-01" };

for (const store of await storeCases()) {
	const title = store.skip === null ? store.name : `${store.name} (skipped: ${store.skip})`;

	describe.skipIf(store.skip !== null)(title, () => {
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

		async function ids(
			query: string,
			brand: Brand = "psizone",
			locale: Locale = "ro",
		): Promise<string[]> {
			return (await k.search({ query, brand, locale, topK: 50 })).map((p) => p.source.id);
		}

		/** Counts the rows actually stored in one index (through Mastra's store, not ours). */
		function rows(brand: "psizone" | "hemisync", locale: "ro" | "en"): Promise<number> {
			return ts.count(indexName(brand, locale, lexical.space));
		}

		it("reports the store it writes to", async () => {
			expect(k.store.kind).toBe(store.name);
			const report = await k.ingest([entry({ id: "a", body: "Telefon." })]);
			expect(report.store).toEqual(k.store);
		});

		describe("search on an empty store", () => {
			it("returns nothing, and nothing for a query of stop words only", async () => {
				expect(await k.search({ query: "telefon", brand: "psizone", locale: "ro" })).toEqual([]);
				await k.ingest([entry({ id: "a", body: "Telefon de contact." })]);
				expect(await k.search({ query: "și de la", brand: "psizone", locale: "ro" })).toEqual([]);
			});

			it("degrades on model-shaped input: blank finds nothing, long is cut, topK is clamped", async () => {
				await k.ingest([entry({ id: "a", body: "Telefon de contact." })]);
				expect(await k.search({ query: "  ", brand: "psizone", locale: "ro" })).toEqual([]);
				const long = `telefon ${"x".repeat(10_000)}`;
				expect((await k.search({ query: long, brand: "psizone", locale: "ro" })).length).toBe(1);
				expect(
					(await k.search({ query: "telefon", brand: "psizone", locale: "ro", topK: 500 })).length,
				).toBe(1);
				await expect(
					k.search({ query: "x", brand: "psizone", locale: "ro", topK: 0 }),
				).rejects.toThrow();
			});
		});

		describe("the rule at search time", () => {
			it("re-checks every stored row: drafts, unreviewed clinical, other brands and junk never surface", async () => {
				const name = indexName("psizone", "ro", lexical.space);
				const base = {
					entryId: "ok",
					brand: "psizone",
					locale: "ro",
					kind: "operational",
					status: "published",
					title: "Telefon",
					url: "/contact",
					reviewedBy: null,
					reviewedAt: null,
					chunk: 0,
					text: "Telefon de contact.",
				};
				const rowsToWrite = [
					base,
					{ ...base, entryId: "draft", status: "draft" },
					{ ...base, entryId: "clinical", kind: "clinical" },
					{ ...base, entryId: "hemi", brand: "hemisync" },
					{ ...base, entryId: "english", locale: "en" },
					{ entryId: "junk", brand: "psizone", locale: "ro", text: "Telefon." },
				];
				const raw: RawRow[] = rowsToWrite.map((metadata) => ({
					id: `${metadata.entryId}#0`,
					vector: lexicalVector("Telefon de contact."),
					metadata,
				}));
				await ts.writeRaw(name, 1024, raw);
				expect(await rows("psizone", "ro")).toBe(rowsToWrite.length);
				expect(await ids("telefon")).toEqual(["ok"]);
			});
		});

		describe("the retrievability rule at ingest", () => {
			it("indexes published entries and clinical ones only when reviewed; reports the rest", async () => {
				const report = await k.ingest([
					entry({ id: "ops", body: "Program de lucru și telefon." }),
					entry({ id: "draft", status: "draft", body: "Telefon ciornă." }),
					entry({ id: "clin-no", kind: "clinical", body: "Telefon clinic nerevizuit." }),
					entry({
						id: "clin-half",
						kind: "clinical",
						reviewedBy: "Dr. Ana Pop",
						body: "Telefon clinic.",
					}),
					entry({ id: "clin-ok", kind: "clinical", ...reviewed, body: "Telefon clinic revizuit." }),
				]);
				expect(report.indexed.map((i) => i.id)).toEqual(["ops", "clin-ok"]);
				expect(report.skipped).toEqual([
					{ id: "draft", reason: "draft" },
					{ id: "clin-no", reason: "clinical-unreviewed" },
					{ id: "clin-half", reason: "clinical-unreviewed" },
				]);
				expect(report.embedder).toEqual({
					kind: "lexical",
					model: lexical.model,
					space: lexical.space,
					dimension: 1024,
				});
				expect((await ids("telefon")).sort()).toEqual(["clin-ok", "ops"]);
			});

			it("removes an entry that is re-ingested as a draft or loses its review", async () => {
				await k.ingest([
					entry({ id: "a", body: "Telefon unu." }),
					entry({ id: "c", kind: "clinical", ...reviewed, body: "Telefon doi." }),
				]);
				expect((await ids("telefon")).sort()).toEqual(["a", "c"]);
				await k.ingest([
					entry({ id: "a", status: "draft", body: "Telefon unu." }),
					entry({ id: "c", kind: "clinical", body: "Telefon doi." }),
				]);
				expect(await ids("telefon")).toEqual([]);
				expect(await rows("psizone", "ro")).toBe(0);
			});

			it("carries the Source fields, review stamp included, on every passage", async () => {
				await k.ingest([
					entry({
						id: "c",
						kind: "clinical",
						title: "ADHD",
						url: "/copii/adhd",
						...reviewed,
						body: "Atenție și școală.",
					}),
				]);
				const [p] = await k.search({ query: "școală", brand: "psizone", locale: "ro" });
				expect(p?.source).toEqual({
					id: "c",
					title: "ADHD",
					url: "/copii/adhd",
					reviewedBy: "Dr. Ana Pop",
					reviewedAt: "2026-10-01",
				});
				expect(p?.text).toBe("Atenție și școală.");
				expect(p?.score).toBeGreaterThan(0);
			});

			it("drops an old review stamp when an entry is re-ingested without one", async () => {
				await k.ingest([entry({ id: "o", ...reviewed, body: "Telefon." })]);
				await k.ingest([entry({ id: "o", body: "Telefon." })]);
				const [p] = await k.search({ query: "telefon", brand: "psizone", locale: "ro" });
				expect(p?.source.reviewedBy).toBeNull();
				expect(p?.source.reviewedAt).toBeNull();
			});
		});

		describe("brand isolation", () => {
			it("keeps Hemi-Sync and Psizone in separate indexes: identical text never crosses", async () => {
				const body = "Atelier de relaxare cu sunet binaural, telefon pentru înscrieri.";
				await k.ingest([
					entry({ id: "hs", brand: "hemisync", body }),
					entry({ id: "pz", brand: "psizone", body }),
				]);
				expect(await ids("sunet binaural telefon", "psizone")).toEqual(["pz"]);
				const hemi = await k.search({
					query: "sunet binaural telefon",
					brand: "hemisync",
					locale: "ro",
					topK: 50,
				});
				expect(hemi.map((p) => p.source.id)).toEqual(["hs"]);
				expect(indexName("hemisync", "ro", lexical.space)).not.toBe(
					indexName("psizone", "ro", lexical.space),
				);
			});

			it("returns nothing for a brand with no content, even when other brands match", async () => {
				await k.ingest([entry({ id: "pz", body: "Telefon de contact." })]);
				for (const brand of ["eqsync", "hemisync", "blog"] as const) {
					expect(await k.search({ query: "telefon", brand, locale: "ro" })).toEqual([]);
				}
			});

			it("moves an entry whose brand changes: it leaves the old index", async () => {
				await k.ingest([entry({ id: "m", brand: "psizone", body: "Telefon mutat." })]);
				await k.ingest([entry({ id: "m", brand: "hemisync", body: "Telefon mutat." })]);
				expect(await ids("telefon", "psizone")).toEqual([]);
				expect(await rows("psizone", "ro")).toBe(0);
				expect(await rows("hemisync", "ro")).toBe(1);
			});
		});

		describe("locale filtering", () => {
			it("answers a locale only from that locale's entries", async () => {
				await k.ingest([
					entry({ id: "ro", locale: "ro", body: "Contact contact telefon." }),
					entry({ id: "en", locale: "en", body: "Contact contact phone." }),
				]);
				expect(await ids("contact", "psizone", "ro")).toEqual(["ro"]);
				expect(await ids("contact", "psizone", "en")).toEqual(["en"]);
			});
		});

		describe("idempotent ingest and remove", () => {
			it("re-ingesting the same id replaces it, leaving no stale chunks when the body shrinks", async () => {
				const long = Array.from(
					{ length: 8 },
					(_, i) => `## Parte ${i}\n\n${"Telefon și program. ".repeat(90)}`,
				).join("\n\n");
				const first = await k.ingest([entry({ id: "a", body: long })]);
				expect(first.chunks).toBeGreaterThan(1);
				expect(await rows("psizone", "ro")).toBe(first.chunks);
				await k.ingest([entry({ id: "a", body: "Telefon nou." })]);
				await k.ingest([entry({ id: "a", body: "Telefon nou." })]);
				expect(await rows("psizone", "ro")).toBe(1);
				const passages = await k.search({ query: "telefon", brand: "psizone", locale: "ro" });
				expect(passages.map((p) => p.text)).toEqual(["Telefon nou."]);
			});

			it("refuses duplicate ids in one batch and leaves the store untouched", async () => {
				await k.ingest([entry({ id: "a", body: "Telefon." })]);
				await expect(
					k.ingest([entry({ id: "a", body: "x" }), entry({ id: "a", body: "y" })]),
				).rejects.toThrow(/duplicate/);
				expect(await ids("telefon")).toEqual(["a"]);
			});

			it("removes only the given ids, everywhere; an empty list is a no-op", async () => {
				await k.ingest([
					entry({ id: "a", body: "Telefon a." }),
					entry({ id: "b", body: "Telefon b." }),
					entry({ id: "a-en", locale: "en", body: "Phone a." }),
				]);
				await k.remove([]);
				await k.remove(["a", "a-en", "never-existed"]);
				expect(await ids("telefon")).toEqual(["b"]);
				expect(await ids("phone", "psizone", "en")).toEqual([]);
			});

			it("keeps embedders in separate vector spaces; an ingest sweeps the id out of every space", async () => {
				await k.ingest([entry({ id: "a", body: "Telefon." })]);
				const small = createKnowledge({
					vector: ts.vector,
					embedder: createLexicalEmbedder(64),
				});
				try {
					expect(await small.search({ query: "telefon", brand: "psizone", locale: "ro" })).toEqual(
						[],
					);
					const r = await small.ingest([entry({ id: "a", body: "Telefon." })]);
					expect(r.embedder.dimension).toBe(64);
					expect(
						(await small.search({ query: "telefon", brand: "psizone", locale: "ro" })).length,
					).toBe(1);
					// No stale copy survives in the other space (an unpublish there must not be missed).
					expect(await ids("telefon")).toEqual([]);
				} finally {
					await small.close();
				}
			});
		});
	});
}
