import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLexicalEmbedder } from "../embedder/lexical";
import { KnowledgeEntrySchema } from "../entry";
import { ProductionGuardError, readDataCollection, readDemoKnowledge } from "../env/flags";
import { createKnowledge } from "../knowledge";
import { SEED } from "../seed/index";
import { type TempDb, tempDb } from "../testing/temp-db";
import { DEMO_REVIEWER, DEMO_TITLE_PREFIX, isDemoId } from "./entry";
import { DEMO, demoEntries } from "./index";
import { ingestSeedAndDemo } from "./ingest";

const BRANDS = ["psizone", "eqsync", "hemisync", "blog"] as const;
const LOCALES = ["ro", "en"] as const;

let db: TempDb;
beforeEach(() => {
	db = tempDb();
});
afterEach(() => db.cleanup());

describe("the demo knowledge base", () => {
	it("marks every entry as demo: id, title, URL, body notice and flag", () => {
		for (const e of DEMO) {
			expect(e.demo).toBe(true);
			expect(isDemoId(e.id)).toBe(true);
			expect(e.id.startsWith(`demo-${e.brand}-${e.locale}-`)).toBe(true);
			expect(e.title.startsWith(DEMO_TITLE_PREFIX)).toBe(true);
			expect(e.url.startsWith(`/demo/${e.brand}/${e.locale}/`)).toBe(true);
			expect(e.body).toContain("[DEMO]");
			expect(() => KnowledgeEntrySchema.parse(e)).not.toThrow();
		}
		expect(new Set(DEMO.map((e) => e.id)).size).toBe(DEMO.length);
		expect(SEED.some((e) => isDemoId(e.id))).toBe(false);
	});

	it("holds 15 retrievable entries per brand and locale, 2 of them reviewed clinical, plus one unreviewed", () => {
		for (const brand of BRANDS) {
			for (const locale of LOCALES) {
				const set = DEMO.filter((e) => e.brand === brand && e.locale === locale);
				const clinical = set.filter((e) => e.kind === "clinical");
				expect(set).toHaveLength(16);
				expect(clinical.filter((e) => e.reviewedBy === DEMO_REVIEWER)).toHaveLength(2);
				expect(clinical.filter((e) => e.reviewedBy === null)).toHaveLength(1);
			}
		}
	});

	it("mirrors every slug in both locales", () => {
		for (const brand of BRANDS) {
			const slugs = (locale: "ro" | "en") =>
				DEMO.filter((e) => e.brand === brand && e.locale === locale).map((e) =>
					e.id.replace(`demo-${brand}-${locale}-`, ""),
				);
			expect(slugs("en")).toEqual(slugs("ro"));
		}
	});

	it("carries no prices, phone numbers, e-mail addresses or percentages", () => {
		const text = DEMO.map((e) => `${e.title}\n${e.body}`).join("\n");
		for (const banned of [/\blei\b/i, /\bRON\b/, /€|\$/, /@/, /%/, /\b0\d{3} ?\d{3} ?\d{3}\b/]) {
			expect(text).not.toMatch(banned);
		}
	});

	it("ingests the seed and the demo; the rule skips the unreviewed clinical entries", async () => {
		const embedder = createLexicalEmbedder();
		const env = { PSI_DEMO_KNOWLEDGE: "true", CHROMA_URL: "" };
		const report = await ingestSeedAndDemo({
			env,
			url: db.url,
			embedder,
			vector: { kind: "libsql", url: db.url },
		});
		expect(report.indexed).toHaveLength(SEED.length + 15 * 8);
		expect(report.skipped).toHaveLength(8);
		for (const s of report.skipped) {
			expect(s.reason).toBe("clinical-unreviewed");
			expect(s.id.endsWith("-unreviewed-clinical-note")).toBe(true);
		}
		const kb = createKnowledge({ vector: { kind: "libsql", url: db.url }, embedder });
		try {
			const found = await kb.search({ query: "căști", brand: "eqsync", locale: "ro" });
			expect(found.some((p) => p.source.title.startsWith(DEMO_TITLE_PREFIX))).toBe(true);
			const reviewed = DEMO.find((e) => e.brand === "blog" && e.reviewedBy === DEMO_REVIEWER);
			const hits = await kb.search({
				query: reviewed?.title.replace(DEMO_TITLE_PREFIX, "") ?? "",
				brand: "blog",
				locale: reviewed?.locale ?? "ro",
			});
			const hit = hits.find((p) => p.source.id === reviewed?.id);
			expect(hit?.source.reviewedBy).toBe(DEMO_REVIEWER);
		} finally {
			await kb.close();
		}
	});

	it("refuses the demo ingest without the flag", async () => {
		await expect(
			ingestSeedAndDemo({ env: {}, url: db.url, vector: { kind: "libsql", url: db.url } }),
		).rejects.toThrow(/PSI_DEMO_KNOWLEDGE=true/);
	});
});

describe("the development-only switches", () => {
	it("loads the demo only with PSI_DEMO_KNOWLEDGE=true, and never in production", () => {
		expect(demoEntries({})).toEqual([]);
		expect(demoEntries({ PSI_DEMO_KNOWLEDGE: "false" })).toEqual([]);
		expect(demoEntries({ PSI_DEMO_KNOWLEDGE: "true" })).toBe(DEMO);
		expect(() => readDemoKnowledge({ PSI_DEMO_KNOWLEDGE: "yes" })).toThrow();
		expect(() => demoEntries({ PSI_DEMO_KNOWLEDGE: "true", NODE_ENV: "production" })).toThrow(
			ProductionGuardError,
		);
		expect(() => demoEntries({ PSI_DEMO_KNOWLEDGE: "true", SITE_ENV: "Production" })).toThrow(
			ProductionGuardError,
		);
		expect(readDemoKnowledge({ PSI_DEMO_KNOWLEDGE: "false", NODE_ENV: "production" })).toBe(false);
	});

	it("routes OpenRouter with deny unless allow is set outside production", () => {
		expect(readDataCollection({})).toBe("deny");
		expect(readDataCollection({ PSI_OPENROUTER_DATA_COLLECTION: " " })).toBe("deny");
		expect(readDataCollection({ PSI_OPENROUTER_DATA_COLLECTION: "allow" })).toBe("allow");
		expect(() => readDataCollection({ PSI_OPENROUTER_DATA_COLLECTION: "maybe" })).toThrow();
		for (const prod of [{ NODE_ENV: "production" }, { SITE_ENV: "production" }]) {
			expect(() =>
				readDataCollection({ PSI_OPENROUTER_DATA_COLLECTION: "allow", ...prod }),
			).toThrow(ProductionGuardError);
			expect(readDataCollection({ PSI_OPENROUTER_DATA_COLLECTION: "deny", ...prod })).toBe("deny");
		}
	});
});
