import { ARTICLES } from "@psi/content";
import { describe, expect, it } from "vitest";
import { BRANDS, brandFrom } from "./brands";
import { currentIndex, findArticle, listing, usedTopics } from "./content/articles";
import { rssFeed } from "./rss";

const RETIRED = ARTICLES.filter((a) => a.brand === "eqsync");
const ORIGIN = "https://blog.example.test";

/** EQ-SYNC is retired: its articles stay in the content and are served nowhere on the blog. */
describe("the blog and a retired brand", () => {
	it("has retired content to hide (the content itself is untouched)", () => {
		expect(RETIRED.length).toBeGreaterThan(0);
	});

	it("answers none of its article URLs (the page route finds no article, so it is a 404)", () => {
		for (const a of RETIRED) expect(findArticle(a.slug)).toBeUndefined();
	});

	it("lists none of its articles: not in the listing, the index, the topics or a filter", () => {
		expect(listing().some((a) => a.brand === "eqsync")).toBe(false);
		expect(currentIndex().some((s) => s.brand === "eqsync")).toBe(false);
		expect(usedTopics()).not.toContain("programul-eqsync");
		expect(listing({ brand: "eqsync" })).toEqual([]);
		expect(BRANDS).not.toContain("eqsync");
		expect(brandFrom("eqsync")).toBeUndefined();
		expect(brandFrom("psizone")).toBe("psizone");
	});

	it("keeps its articles out of the feeds, in both languages", () => {
		for (const locale of ["ro", "en"] as const) {
			const xml = rssFeed(locale, ORIGIN);
			for (const a of RETIRED) expect(xml).not.toContain(a.slug);
		}
	});

	it("still serves the other brands", () => {
		expect(listing().length).toBeGreaterThan(0);
		expect(brandFrom("hemisync")).toBe("hemisync");
	});
});
