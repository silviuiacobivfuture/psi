import { describe, expect, it } from "vitest";
import { ARTICLES } from "./articles/catalogue";
import { includeDraftsFrom, originsFrom } from "./origins";
import { buildIndex, byTopic, latestFor, related, summaryFor } from "./query";
import { articleUrl, blogPaths, brandListingUrl } from "./routes";

const BLOG = "https://blog.psizone.ro";
const staging = buildIndex(ARTICLES, { blogOrigin: BLOG, includeDrafts: true });
const production = buildIndex(ARTICLES, { blogOrigin: BLOG, includeDrafts: false });

describe("buildIndex", () => {
	it("summarises readable articles in both locales, never backlog stubs", () => {
		expect(staging.every((a) => a.standfirst.length > 0)).toBe(true);
		const stubs = new Set(ARTICLES.filter((a) => a.status === "in-review").map((a) => a.slug));
		expect(staging.some((a) => stubs.has(a.slug))).toBe(false);
		const ids = new Set(staging.map((a) => a.id));
		expect(staging.length).toBe(ids.size * 2);
	});

	it("keeps drafts out of production", () => {
		expect(production.every((a) => a.status === "published")).toBe(true);
		expect(staging.some((a) => a.status === "draft")).toBe(true);
	});

	it("links every summary to its absolute blog URL", () => {
		const ro = summaryFor("cum-scriem-si-revizuim-articolele", "ro", production);
		const en = summaryFor("cum-scriem-si-revizuim-articolele", "en", production);
		expect(ro?.url).toBe(`${BLOG}/articole/cum-scriem-si-revizuim-articolele`);
		expect(en?.url).toBe(`${BLOG}/en/articles/cum-scriem-si-revizuim-articolele`);
	});

	it("sorts newest first, then by slug", () => {
		const keys = staging.map((a) => `${a.date}|${a.slug}`);
		for (let i = 1; i < staging.length; i++) {
			const [prev, next] = [staging[i - 1], staging[i]];
			if (prev === undefined || next === undefined) continue;
			expect(prev.date >= next.date, keys.join(",")).toBe(true);
			if (prev.date === next.date) expect(prev.slug <= next.slug).toBe(true);
		}
	});

	it("carries a reading time and no reviewer on unreviewed articles", () => {
		for (const a of staging) {
			expect(a.readingMinutes).toBeGreaterThanOrEqual(1);
			if (a.status === "draft") expect(a.reviewer).toBeNull();
		}
	});
});

describe("latestFor", () => {
	it("returns one brand in one locale, at most n", () => {
		const latest = latestFor("eqsync", "en", 2, staging);
		expect(latest).toHaveLength(2);
		expect(latest.every((a) => a.brand === "eqsync" && a.locale === "en")).toBe(true);
	});

	it("never mixes brands: Psizone gets only Psizone", () => {
		expect(latestFor("psizone", "ro", 50, staging).every((a) => a.brand === "psizone")).toBe(true);
	});

	it("is empty for a brand with nothing visible, and for n ≤ 0", () => {
		expect(latestFor("hemisync", "ro", 3, production)).toEqual([]);
		expect(latestFor("psizone", "ro", 0, staging)).toEqual([]);
	});
});

describe("related", () => {
	it("stays within the brand and locale, excludes the article, puts its topic first", () => {
		const article = summaryFor("un-plan-o-echipa-cum-lucram", "ro", staging);
		expect(article).toBeDefined();
		if (article === undefined) return;
		const next = related(article, 3, staging);
		expect(next.length).toBeGreaterThan(0);
		expect(next.every((a) => a.brand === "psizone" && a.locale === "ro")).toBe(true);
		expect(next.some((a) => a.slug === article.slug)).toBe(false);
		expect(next[0]?.topic).toBe(article.topic);
	});

	it("respects n", () => {
		const article = summaryFor("de-ce-ai-nevoie-de-casti", "en", staging);
		if (article === undefined) throw new Error("missing fixture");
		expect(related(article, 1, staging)).toHaveLength(1);
	});
});

describe("byTopic", () => {
	it("filters by topic and locale, optionally by brand", () => {
		const all = byTopic("programul-eqsync", "ro", undefined, staging);
		expect(all.length).toBeGreaterThanOrEqual(2);
		expect(all.every((a) => a.topic === "programul-eqsync" && a.locale === "ro")).toBe(true);
		expect(byTopic("programul-eqsync", "ro", "psizone", staging)).toEqual([]);
	});
});

describe("environment", () => {
	it("parses origins, with local defaults and no trailing slash", () => {
		expect(originsFrom({}).blog).toBe("http://localhost:4340");
		expect(originsFrom({ BLOG_URL: "https://blog.psizone.ro/" }).blog).toBe(BLOG);
		expect(() => originsFrom({ BLOG_URL: "not a url" })).toThrow();
	});

	it("shows drafts on staging and local hosts, never on an indexable or production one", () => {
		expect(includeDraftsFrom({})).toBe(true);
		expect(includeDraftsFrom({ SITE_ENV: "staging" })).toBe(true);
		expect(includeDraftsFrom({ SITE_ENV: "production" })).toBe(false);
		expect(includeDraftsFrom({ PSI_ALLOW_INDEXING: "true" })).toBe(false);
		expect(includeDraftsFrom({ PSI_ALLOW_INDEXING: "true", SITE_ENV: "staging" })).toBe(true);
	});

	it("builds the blog's paths and absolute URLs in both locales", () => {
		expect(blogPaths.home("ro")).toBe("/");
		expect(blogPaths.home("en")).toBe("/en");
		expect(blogPaths.brandFeed("ro", "eqsync")).toBe("/rss/eqsync.xml");
		expect(blogPaths.brandFeed("en", "eqsync")).toBe("/en/rss/eqsync.xml");
		expect(articleUrl("en", "x", BLOG)).toBe(`${BLOG}/en/articles/x`);
		expect(brandListingUrl("ro", "hemisync", BLOG)).toBe(`${BLOG}/?brand=hemisync#articole`);
	});
});
