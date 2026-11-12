import { ARTICLES } from "@psi/content";
import { describe, expect, it } from "vitest";
import { merge } from "./store";

describe("merging the CMS over the repository", () => {
	it("lets a CMS article win on its slug and keeps the repository's others", () => {
		const [first, ...rest] = ARTICLES;
		if (first === undefined) throw new Error("empty catalogue");
		const fromCms = { ...first, title: { ro: "Din CMS", en: "From the CMS" } };
		const merged = merge([fromCms], ARTICLES);
		expect(merged).toHaveLength(ARTICLES.length);
		expect(merged.find((a) => a.slug === first.slug)?.title.ro).toBe("Din CMS");
		expect(merged.filter((a) => a.slug !== first.slug)).toEqual(rest);
	});
	it("serves the CMS alone once the repository's catalogue is retired", () => {
		const [first] = ARTICLES;
		if (first === undefined) throw new Error("empty catalogue");
		expect(merge([first], ARTICLES, false)).toEqual([first]);
	});
});
