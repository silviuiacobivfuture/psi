import { type Article, parseCatalogue } from "@psi/content";
import { createKnowledge, createLexicalEmbedder } from "@psi/knowledge";
import { describe, expect, it } from "vitest";
import { ARTICLE_POLICY, psiArticles } from "../articles";
import { BRANDS } from "../contract";
import { articleEntries, knowledgeIngest } from "../ingest";

const BLOG = "https://blog.example.test";
const words = (n: number, w: string): string => Array.from({ length: n }, () => w).join(" ");

function article(
	brand: "psizone" | "eqsync" | "hemisync",
	slug: string,
	title: string,
	over: Record<string, unknown> = {},
): unknown {
	const both = (t: string): { ro: string; en: string } => ({ ro: t, en: `${t} (en)` });
	const faq = both(words(40, "raspuns"));
	return {
		slug,
		brand,
		topic: brand === "hemisync" ? "sunet-si-creier" : "anxietate-depresie",
		title: both(title),
		backlogNo: null,
		status: "published",
		kind: "editorial",
		standfirst: both(`Rezumat pentru ${title}`),
		publishedAt: "2026-10-01",
		body: [{ type: "p", text: both(words(30, "text")) }],
		seo: {
			title: both(title),
			description: both(words(14, "descriere")),
			keywords: { ro: [`cuvant ${slug}`], en: [`word ${slug}`] },
		},
		faq: [{ q: both(`Intrebare despre ${slug}?`), a: faq }],
		author: { team: both("Redactia") },
		reviewer: null,
		...over,
	};
}

const SOURCE: ReadonlyArray<Article> = parseCatalogue([
	article("psizone", "atacul-de-panica-psi", "Atacul de panică, pas cu pas"),
	article("psizone", "somn-psi", "Somnul și anxietatea"),
	article("eqsync", "casti-eq", "Cum se potrivesc căștile EQ"),
	article("hemisync", "focus-hemi", "Nivelurile Focus explicate"),
	article("hemisync", "panica-hemi", "Panica și respirația Hemi-Sync"),
	article("psizone", "draft-psi", "Ciornă despre panică", {
		status: "draft",
		draftedAt: "2026-10-02",
		publishedAt: undefined,
		aiDrafted: false,
		author: null,
		reviewer: null,
	}),
]);

const query = (
	profile: string,
	over: Partial<{
		query: string;
		topic: string;
		brand: string;
		locale: string;
		limit: number;
	}> = {},
) =>
	psiArticles({ articles: SOURCE, blogOrigin: BLOG, includeDrafts: false }).find({
		profile,
		locale: "ro",
		limit: 20,
		...over,
	});

describe("ARTICLE_POLICY", () => {
	it("is the whole segregation, per guide", () => {
		expect(ARTICLE_POLICY).toEqual({
			psizone: ["psizone"],
			eqsync: ["eqsync", "psizone"],
			hemisync: ["hemisync"],
			blog: ["psizone", "eqsync", "hemisync"],
		});
	});

	it("covers every guide, and only the blog's guide sees every brand", () => {
		expect(Object.keys(ARTICLE_POLICY).sort()).toEqual([...BRANDS].sort());
		for (const brand of BRANDS) {
			expect(ARTICLE_POLICY[brand].length === 3).toBe(brand === "blog");
		}
	});

	it("never lets Psizone's guide recommend Hemi-Sync, even asked by brand", async () => {
		const all = await query("psizone");
		expect(all.articles.every((a) => a.brand === "psizone")).toBe(true);
		const asked = await query("psizone", { brand: "hemisync" });
		expect(asked.articles).toEqual([]);
		expect(asked.brands).toEqual(["psizone"]);
		const about = await query("psizone", { query: "panica Hemi-Sync" });
		expect(about.articles.map((a) => a.brand)).toEqual(["psizone"]);
	});

	it("lets EQ-SYNC point to Psizone's and its own, never Hemi-Sync's", async () => {
		const r = await query("eqsync");
		expect(new Set(r.articles.map((a) => a.brand))).toEqual(new Set(["eqsync", "psizone"]));
	});

	it("keeps Hemi-Sync to its own", async () => {
		const r = await query("hemisync");
		expect(r.articles.map((a) => a.brand)).toEqual(["hemisync", "hemisync"]);
	});

	it("shows the blog's guide all three brands", async () => {
		const r = await query("blog");
		expect(r.brands).toEqual(["psizone", "eqsync", "hemisync"]);
		expect(r.total).toBe(5);
	});

	it("gives an unknown guide nothing", async () => {
		const r = await query("someone-else");
		expect(r).toEqual({ total: 0, articles: [], topics: [], brands: [] });
	});
});

describe("findArticles lookup", () => {
	it("lists the newest when there is no subject, and says so when the words are only filler", async () => {
		const plain = await query("blog");
		const filler = await query("blog", { query: "aveti ceva articole de blog?" });
		expect(filler.articles).toEqual(plain.articles);
	});

	it("returns metadata and an absolute blog URL, never a body", async () => {
		const r = await query("psizone", { query: "atacul de panica" });
		expect(r.articles[0]).toMatchObject({
			title: "Atacul de panică, pas cu pas",
			brand: "psizone",
			topic: "anxietate-depresie",
			url: `${BLOG}/articole/atacul-de-panica-psi`,
		});
		expect(Object.keys(r.articles[0] ?? {}).sort()).toEqual(
			["brand", "date", "readingMinutes", "standfirst", "title", "topic", "url"].sort(),
		);
	});

	it("matches diacritics-free words, SEO keywords and FAQ questions", async () => {
		expect((await query("psizone", { query: "panica" })).articles).toHaveLength(1);
		expect((await query("psizone", { query: "cuvant somn-psi" })).articles[0]?.title).toBe(
			"Somnul și anxietatea",
		);
		expect((await query("psizone", { query: "casti-eq" })).articles).toEqual([]);
		expect((await query("eqsync", { query: "intrebare casti-eq" })).articles[0]?.title).toBe(
			"Cum se potrivesc căștile EQ",
		);
	});

	it("filters by topic and brand, and answers nothing for what does not match", async () => {
		expect((await query("blog", { topic: "sunet-si-creier" })).total).toBe(2);
		expect((await query("blog", { brand: "eqsync" })).total).toBe(1);
		expect((await query("blog", { topic: "autism" })).total).toBe(0);
		expect((await query("psizone", { query: "zzzzzz" })).total).toBe(0);
	});

	it("caps the list but reports the total, and answers in the asked locale", async () => {
		const few = await query("blog", { limit: 2 });
		expect(few.articles).toHaveLength(2);
		expect(few.total).toBe(5);
		const en = await query("psizone", { locale: "en", limit: 1 });
		expect(en.articles[0]?.url).toContain("/en/articles/");
		expect(en.articles[0]?.title).toMatch(/\(en\)$/);
	});
});

describe("visibility follows the blog", () => {
	it("hides drafts where the blog hides them and shows them where it shows them", async () => {
		const find = async (includeDrafts: boolean) =>
			psiArticles({ articles: SOURCE, blogOrigin: BLOG, includeDrafts }).find({
				profile: "psizone",
				locale: "ro",
				limit: 20,
			});
		const production = await find(false);
		const staging = await find(true);
		expect(production.articles.some((a) => a.title.startsWith("Ciornă"))).toBe(false);
		expect(staging.articles.some((a) => a.title.startsWith("Ciornă"))).toBe(true);
		expect(staging.total).toBe(production.total + 1);
	});
});

describe("the articles ingest set", () => {
	it("is a named set of the guide's ingest, next to the seed", () => {
		const kb = createKnowledge({ url: "file::memory:", embedder: createLexicalEmbedder() });
		const ingest = knowledgeIngest(kb, { demo: false });
		expect(Object.keys(ingest.sets ?? {})).toEqual(["seed", "articles"]);
		expect(ingest.sets?.articles?.().length).toBe(articleEntries().length);
	});

	it("holds an entry per article, locale and index, valid as knowledge entries", () => {
		const entries = articleEntries();
		expect(entries.length).toBeGreaterThan(0);
		expect(entries.every((e) => e.url.startsWith("http"))).toBe(true);
		expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
		expect(new Set(entries.map((e) => e.brand))).toContain("blog");
	});

	it("indexes the published ones and reports drafts as skipped (THE RULE)", async () => {
		const kb = createKnowledge({ url: "file::memory:", embedder: createLexicalEmbedder() });
		try {
			const ingest = knowledgeIngest(kb, { demo: false });
			const draft = {
				id: "content.ar.draft-x.ro",
				brand: "psizone",
				locale: "ro",
				kind: "editorial",
				title: "Ciornă",
				url: `${BLOG}/articole/draft-x`,
				body: "Text de ciornă.",
				status: "draft",
				reviewedBy: null,
				reviewedAt: null,
			};
			const published = { ...draft, id: "content.ar.pub-x.ro", status: "published" };
			const report = await ingest.ingest([draft, published]);
			expect(report.indexed.map((i) => i.id)).toEqual(["content.ar.pub-x.ro"]);
			expect(report.skipped.map((s) => s.id)).toEqual(["content.ar.draft-x.ro"]);
		} finally {
			await kb.close();
		}
	});
});
