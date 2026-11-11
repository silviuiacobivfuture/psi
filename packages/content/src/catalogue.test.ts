import { describe, expect, it } from "vitest";
import { ARTICLES, EDITORIAL_POLICY, parseCatalogue } from "./articles/catalogue";
import { LOCALES } from "./locale";
import { Article, type ArticleInput, isReadable } from "./schema";

const draft: ArticleInput = {
	slug: "o-ciorna",
	brand: "eqsync",
	topic: "programul-eqsync",
	backlogNo: null,
	status: "draft",
	kind: "editorial",
	aiDrafted: true,
	draftedAt: "2026-11-12",
	standfirst: { ro: "Răspuns.", en: "Answer." },
	body: [{ type: "p", text: { ro: "Text.", en: "Text." } }],
	provenance: ["docs/brands/CONTEXT.md"],
	author: null,
	reviewer: null,
	title: { ro: "Titlu", en: "Title" },
};

/** Every word of an article in one locale: what a reader can see of it. */
function textOf(a: (typeof ARTICLES)[number], locale: "ro" | "en"): string {
	if (!isReadable(a)) return a.title[locale];
	const body = a.body.flatMap((b) =>
		b.type === "list" ? b.items.map((i) => i[locale]) : [b.text[locale]],
	);
	return [a.title[locale], a.standfirst[locale], ...body].join(" ");
}

describe("the catalogue", () => {
	it("parses, with unique slugs", () => {
		expect(ARTICLES.length).toBeGreaterThan(10);
		expect(new Set(ARTICLES.map((a) => a.slug)).size).toBe(ARTICLES.length);
	});

	it("refuses a reused slug", () => {
		expect(() => parseCatalogue([draft, draft])).toThrow(/duplicate article slug/);
	});

	it("has at least two drafts per brand, each AI-drafted, unreviewed and sourced", () => {
		const drafts = ARTICLES.filter((a) => a.status === "draft");
		for (const brand of ["psizone", "eqsync", "hemisync"] as const) {
			expect(drafts.filter((a) => a.brand === brand).length).toBeGreaterThanOrEqual(2);
		}
		for (const a of drafts) {
			expect(a.aiDrafted).toBe(true);
			expect(a.reviewer).toBeNull();
			expect(a.status === "draft" && a.provenance.length).toBeGreaterThan(0);
		}
	});

	it("keeps every standfirst within 60 words, in both locales", () => {
		for (const a of ARTICLES.filter(isReadable)) {
			for (const locale of LOCALES) {
				expect(a.standfirst[locale].split(/\s+/).length, a.slug).toBeLessThanOrEqual(60);
			}
		}
	});

	it("never mentions the other brands in a Psizone article", () => {
		for (const a of ARTICLES.filter((x) => x.brand === "psizone")) {
			for (const locale of LOCALES) {
				expect(textOf(a, locale), a.slug).not.toMatch(/hemi-?sync|eq-?sync|monroe/i);
			}
		}
	});

	it("exposes the editorial policy as a published editorial article", () => {
		expect(EDITORIAL_POLICY.status).toBe("published");
		expect(EDITORIAL_POLICY.kind).toBe("editorial");
	});
});

describe("the article schema", () => {
	it("defaults aiDrafted to false where it is not stated", () => {
		const parsed = Article.parse({
			slug: "x",
			brand: "psizone",
			topic: "autism",
			backlogNo: 1,
			status: "in-review",
			author: null,
			reviewer: null,
			title: { ro: "X", en: "X" },
		});
		expect(parsed.aiDrafted).toBe(false);
	});

	it("refuses a draft without provenance", () => {
		expect(() => Article.parse({ ...draft, provenance: [] })).toThrow();
	});

	it("refuses a published health article without a clinical reviewer", () => {
		const health = {
			slug: "x",
			brand: "psizone",
			topic: "autism",
			backlogNo: null,
			title: { ro: "X", en: "X" },
			standfirst: { ro: "Răspuns.", en: "Answer." },
			body: [{ type: "p", text: { ro: "Text.", en: "Text." } }],
			status: "published",
			kind: "health",
			publishedAt: "2026-11-12",
			author: { name: "A", credentials: { ro: "Psiholog", en: "Psychologist" } },
			sources: [{ label: { ro: "S", en: "S" }, href: "https://example.org" }],
		};
		expect(() => Article.parse({ ...health, reviewer: null })).toThrow();
		expect(
			Article.parse({
				...health,
				reviewer: { name: "R", credentials: { ro: "C", en: "C" }, reviewedAt: "2026-11-12" },
			}).status,
		).toBe("published");
	});
});
