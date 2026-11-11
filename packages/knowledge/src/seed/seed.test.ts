import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLexicalEmbedder } from "../embedder/lexical";
import { KnowledgeEntrySchema } from "../entry";
import { createKnowledge } from "../knowledge";
import { type TempDb, tempDb } from "../testing/temp-db";
import { SEED } from "./index";
import { ingestSeed } from "./ingest";

const embedder = createLexicalEmbedder();
let db: TempDb;

beforeEach(() => {
	db = tempDb();
});
afterEach(() => db.cleanup());

describe("the seed", () => {
	const parsed = SEED.map((e) => KnowledgeEntrySchema.parse(e));

	const BRANDS = ["psizone", "eqsync", "hemisync", "blog"] as const;
	const KINDS: Record<(typeof BRANDS)[number], ReadonlyArray<string>> = {
		psizone: ["operational", "editorial"],
		eqsync: ["programme", "operational"],
		hemisync: ["programme", "operational"],
		blog: ["editorial"],
	};

	it("holds only published, non-clinical, unreviewed-by-design entries for every brand, ro and en", () => {
		expect(parsed.length).toBeGreaterThan(0);
		for (const e of parsed) {
			expect(KINDS[e.brand]).toContain(e.kind);
			expect(e.status).toBe("published");
			expect(e.reviewedBy).toBeNull();
			expect(e.id.startsWith(`${e.brand}-${e.locale}-`)).toBe(true);
		}
		expect(new Set(parsed.map((e) => e.brand))).toEqual(new Set(BRANDS));
		expect(new Set(parsed.map((e) => e.id)).size).toBe(parsed.length);
	});

	it("mirrors every entry in both locales, brand by brand", () => {
		for (const brand of BRANDS) {
			const slugs = (locale: "ro" | "en") =>
				parsed
					.filter((e) => e.brand === brand && e.locale === locale)
					.map((e) => e.id.replace(`${brand}-${locale}-`, ""));
			expect(slugs("ro").length).toBeGreaterThan(0);
			expect(slugs("en")).toEqual(slugs("ro"));
		}
	});

	it("serves each entry from its own locale's pages", () => {
		for (const e of parsed.filter((x) => x.brand !== "psizone")) {
			expect(e.url.startsWith("/en")).toBe(e.locale === "en");
		}
	});

	it("carries no prices, no address and no e-mail address", () => {
		const text = parsed.map((e) => `${e.title}\n${e.body}`).join("\n");
		for (const banned of [
			/\blei\b/i,
			/\bRON\b/,
			/€|\$/,
			/\bstr\.|strada|cernat|cuza/i,
			/@/,
			/\bnr\.\s*\d/i,
		]) {
			expect(text).not.toMatch(banned);
		}
		expect(text).toContain("0748 017 752");
		expect(text).toContain("0752 466 792");
	});

	it("ingests into a fresh database and finds the contact entry for 'telefon' and 'phone'", async () => {
		const report = await ingestSeed({ url: db.url, embedder });
		expect(report.embedder.kind).toBe("lexical");
		expect(report.skipped).toEqual([]);
		expect(report.indexed).toHaveLength(SEED.length);

		const k = createKnowledge({ url: db.url, embedder });
		try {
			const ro = await k.search({ query: "telefon", brand: "psizone", locale: "ro" });
			expect(ro[0]?.source.id).toBe("psizone-ro-contact-phones");
			expect(ro[0]?.source.url).toBe("/contact");
			expect(ro[0]?.text).toContain("0748 017 752");

			const en = await k.search({ query: "phone", brand: "psizone", locale: "en" });
			expect(en[0]?.source.id).toBe("psizone-en-contact-phones");
			expect(en[0]?.source.url).toBe("/en/contact");

			const hub = await k.search({ query: "autism", brand: "psizone", locale: "ro" });
			expect(hub[0]?.source.url).toBe("/copii/autism");

			for (const p of await k.search({ query: "telefon", brand: "hemisync", locale: "ro" })) {
				expect(p.source.id).toMatch(/^hemisync-ro-/);
			}
		} finally {
			await k.close();
		}
	});

	it("re-running the seed ingest replaces the same entries", async () => {
		const first = await ingestSeed({ url: db.url, embedder });
		const second = await ingestSeed({ url: db.url, embedder });
		expect(second.chunks).toBe(first.chunks);
		const k = createKnowledge({ url: db.url, embedder });
		try {
			const all = await k.search({
				query: "telefon programare",
				brand: "psizone",
				locale: "ro",
				topK: 50,
			});
			const ids = all.map((p) => `${p.source.id}:${p.text}`);
			expect(new Set(ids).size).toBe(ids.length);
		} finally {
			await k.close();
		}
	});

	it("finds each brand's own entries, and only those", async () => {
		await ingestSeed({ url: db.url, embedder });
		const k = createKnowledge({ url: db.url, embedder });
		try {
			const eq = await k.search({ query: "căști", brand: "eqsync", locale: "ro" });
			expect(eq[0]?.source.id).toBe("eqsync-ro-headphones");
			expect(eq[0]?.source.url).toBe("/#intrebari");

			const eqEn = await k.search({
				query: "free programme 21 days",
				brand: "eqsync",
				locale: "en",
			});
			expect(eqEn[0]?.source.id).toBe("eqsync-en-free-programme");

			const hs = await k.search({ query: "nivelurile Focus", brand: "hemisync", locale: "ro" });
			expect(hs[0]?.source.id).toBe("hemisync-ro-focus-levels");

			const hsEn = await k.search({ query: "headphones", brand: "hemisync", locale: "en" });
			expect(hsEn[0]?.source.id).toBe("hemisync-en-headphones");

			const blog = await k.search({
				query: "cine scrie și cine verifică articolul",
				brand: "blog",
				locale: "ro",
			});
			expect(blog[0]?.source.id).toBe("blog-ro-editorial-policy");
			expect(blog[0]?.source.url).toBe("/articole/cum-scriem-si-revizuim-articolele");

			for (const brand of ["psizone", "eqsync", "hemisync", "blog"] as const) {
				for (const locale of ["ro", "en"] as const) {
					for (const query of [
						"telefon programare",
						"căști program",
						"Gateway Voyage",
						"revizuire",
					]) {
						for (const p of await k.search({ query, brand, locale, topK: 50 })) {
							expect(p.source.id.startsWith(`${brand}-${locale}-`)).toBe(true);
						}
					}
				}
			}
			const hemisyncOnPsizone = await k.search({
				query: "telefon contact",
				brand: "hemisync",
				locale: "ro",
				topK: 50,
			});
			expect(hemisyncOnPsizone.some((p) => p.source.id.startsWith("psizone-"))).toBe(false);
		} finally {
			await k.close();
		}
	});
});
