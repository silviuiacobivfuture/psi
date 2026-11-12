import { COVER_IMAGES, EXPLICIT_COVERS, TOPICS } from "@psi/content";
import { describe, expect, it } from "vitest";
import { currentArticles } from "./content/articles";
import { pageFrom, SHELF_IDS, shelfFrom, shelfOf, shelfTopics } from "./content/shelves";
import { coverView } from "./covers";

const LOCALES = ["ro", "en"] as const;

describe("every article has a picture", () => {
	for (const locale of LOCALES) {
		it(`gives each article a photo with alt text in ${locale}, in every slot`, () => {
			expect(currentArticles().length).toBeGreaterThan(0);
			for (const a of currentArticles()) {
				for (const slot of ["article", "featured", "card"] as const) {
					const view = coverView(a, locale, slot);
					const alt = view.picture?.alt ?? view.image?.alt ?? "";
					expect(alt.length, `${a.slug} ${slot}`).toBeGreaterThan(0);
				}
			}
		});
	}

	it("keeps an explicit cover and serves the blog's own paths", () => {
		const a = currentArticles().find((x) => x.slug in EXPLICIT_COVERS);
		if (a === undefined) throw new Error("no article with an explicit cover");
		const picture = coverView(a, "ro", "card").picture;
		expect(picture?.image).toEqual(COVER_IMAGES[EXPLICIT_COVERS[a.slug] ?? "psizoneEditorial"]);
		expect(picture?.image.avif[0]?.src.startsWith("/assets/images/")).toBe(true);
	});

	it("loads only the page's LCP image eagerly at high priority", () => {
		const a = currentArticles()[0];
		if (a === undefined) throw new Error("empty catalogue");
		expect(coverView(a, "ro", "article").picture?.priority).toBe(true);
		expect(coverView(a, "ro", "featured").picture?.priority).toBe(true);
		expect(coverView(a, "ro", "card").picture?.priority).toBe(false);
	});
});

describe("the shelves", () => {
	it("hold every topic exactly once", () => {
		for (const topic of TOPICS) {
			const on = SHELF_IDS.filter((s) => shelfTopics(s).includes(topic));
			expect(on, topic).toHaveLength(1);
			expect(shelfOf(topic)).toBe(on[0]);
		}
	});

	it("reads ?shelf= and ?page= safely", () => {
		expect(shelfFrom("copii")).toBe("copii");
		expect(shelfFrom("nu-exista")).toBeUndefined();
		expect(shelfFrom(undefined)).toBeUndefined();
		expect(pageFrom("3")).toBe(3);
		for (const bad of ["0", "-2", "abc", "1.5", "", undefined, "999999"]) {
			expect(pageFrom(bad), String(bad)).toBe(1);
		}
	});
});
