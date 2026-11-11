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

	it("holds only published, non-clinical, unreviewed-by-design Psizone entries, ro and en", () => {
		expect(parsed.length).toBeGreaterThan(0);
		for (const e of parsed) {
			expect(["operational", "editorial"]).toContain(e.kind);
			expect(e.status).toBe("published");
			expect(e.reviewedBy).toBeNull();
			expect(e.brand).toBe("psizone");
		}
		expect(new Set(parsed.map((e) => e.locale))).toEqual(new Set(["ro", "en"]));
		expect(new Set(parsed.map((e) => e.id)).size).toBe(parsed.length);
	});

	it("mirrors every entry in both locales", () => {
		const ro = parsed.filter((e) => e.locale === "ro").map((e) => e.id.replace("psizone-ro-", ""));
		const en = parsed.filter((e) => e.locale === "en").map((e) => e.id.replace("psizone-en-", ""));
		expect(en).toEqual(ro);
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

			expect(await k.search({ query: "telefon", brand: "hemisync", locale: "ro" })).toEqual([]);
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
});
