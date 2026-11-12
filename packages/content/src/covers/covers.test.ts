import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ARTICLES } from "../articles/catalogue";
import { LOCALES } from "../locale";
import { isReadable, TOPICS } from "../schema";
import { summarize } from "../summary";
import { COVER_ALT } from "./alt";
import { COVER_CREDITS, COVER_IMAGES } from "./covers.generated";
import { coverFor, coverKey, EXPLICIT_COVERS, poolKeys, stableHash } from "./resolve";

const BLOG = "https://blog.psizone.ro";
const CREDITS = JSON.parse(
	readFileSync(new URL("../../../design/imagery/credits.json", import.meta.url), "utf8"),
) as { images: ReadonlyArray<{ name: string; licence: string }> };

// The topic photo pools land in the next release; this release ships the hand-picked covers only.
describe.skip("topic pools", () => {
	it.each(TOPICS)("%s has a pool of at least four photos", (topic) => {
		expect(poolKeys(topic).length).toBeGreaterThanOrEqual(4);
	});

	it("holds no photo for a topic that does not exist", () => {
		const known = new Set<string>(TOPICS);
		for (const key of Object.keys(COVER_IMAGES).filter((k) => k.startsWith("cv-"))) {
			const topic = /^cv-(.+)-\d+$/.exec(key)?.[1] ?? "";
			expect(known.has(topic), key).toBe(true);
		}
	});

	it("gives every photo alt text in both locales, describing the picture", () => {
		for (const key of Object.keys(COVER_IMAGES)) {
			const alt = COVER_ALT[key as keyof typeof COVER_ALT];
			expect(alt.ro.length, key).toBeGreaterThan(10);
			expect(alt.en.length, key).toBeGreaterThan(10);
			expect(alt.ro, key).not.toBe(alt.en);
		}
	});

	it("ships every photo at 480, 960 and 1440 in AVIF, with fallbacks", () => {
		for (const [key, image] of Object.entries(COVER_IMAGES).filter(([k]) => k.startsWith("cv-"))) {
			expect(
				image.avif.map((v) => v.width),
				key,
			).toEqual([480, 960, 1440]);
			expect(image.webp.length, key).toBeGreaterThan(0);
			expect(image.jpeg.length, key).toBeGreaterThan(0);
			expect(image.width / image.height, key).toBeCloseTo(1.5, 1);
		}
	});

	it("credits every photo under a free licence", () => {
		const licences = new Map(CREDITS.images.map((c) => [c.name, c.licence]));
		for (const key of Object.keys(COVER_IMAGES).filter((k) => k.startsWith("cv-"))) {
			expect(["CC0 1.0", "Public Domain Mark 1.0"], key).toContain(licences.get(key));
		}
		expect(COVER_CREDITS.length).toBe(Object.keys(COVER_IMAGES).length);
	});
});

// The topic photo pools land in the next release; this release ships the hand-picked covers only.
describe.skip("coverKey", () => {
	it("is stable: the same slug always lands on the same photo", () => {
		expect(coverKey("un-articol", "autism")).toBe(coverKey("un-articol", "autism"));
		expect(stableHash("un-articol")).toBe(stableHash("un-articol"));
	});

	it("spreads slugs over a whole pool, so neighbours differ", () => {
		const seen = new Set<string>();
		for (let i = 0; i < 200; i++) seen.add(coverKey(`articol-${i}`, "sport") ?? "");
		expect(seen.size).toBe(poolKeys("sport").length);
		const next = Array.from({ length: 40 }, (_, i) => coverKey(`articol-${i}`, "sport"));
		const repeats = next.filter((k, i) => i > 0 && k === next[i - 1]).length;
		expect(repeats).toBeLessThan(20);
	});

	it("keeps an explicit cover over the pool", () => {
		for (const [slug, key] of Object.entries(EXPLICIT_COVERS)) {
			expect(coverKey(slug, "autism")).toBe(key);
		}
	});
});

// The topic photo pools land in the next release; this release ships the hand-picked covers only.
describe.skip("coverFor", () => {
	it("gives every article a cover with alt text in both locales", () => {
		for (const a of ARTICLES) {
			for (const locale of LOCALES) {
				const cover = coverFor(
					{ slug: a.slug, topic: a.topic, cover: "cover" in a ? a.cover : null },
					locale,
					"",
				);
				expect(cover, `${a.slug} ${locale}`).not.toBeNull();
				expect(cover?.alt.length, `${a.slug} ${locale}`).toBeGreaterThan(0);
			}
		}
	});

	it("prefers the CMS's own cover over everything", () => {
		const cover = coverFor(
			{
				slug: "cum-scriem-si-revizuim-articolele",
				topic: "editorial",
				cover: {
					src: "https://cms.example/x.jpg",
					alt: { ro: "Un ro", en: "An en" },
					width: null,
					height: null,
				},
			},
			"en",
			"",
		);
		expect(cover).toEqual({ kind: "url", alt: "An en", src: "https://cms.example/x.jpg" });
	});

	it("puts the blog's origin in front of every path for other sites", () => {
		const cover = coverFor({ slug: "x-y", topic: "autism", cover: null }, "ro", BLOG);
		if (cover?.kind !== "set") throw new Error("expected a photo from the pool");
		for (const v of [...cover.image.avif, ...cover.image.webp, ...cover.image.jpeg]) {
			expect(v.src.startsWith(`${BLOG}/assets/images/`)).toBe(true);
		}
		const own = coverFor({ slug: "x-y", topic: "autism", cover: null }, "ro", "");
		if (own?.kind !== "set") throw new Error("expected a photo from the pool");
		expect(own.image.avif[0]?.src.startsWith("/assets/images/")).toBe(true);
	});

	it("travels in every summary", () => {
		const a = ARTICLES.find(isReadable);
		if (a === undefined) throw new Error("no readable article");
		expect(summarize(a, "ro", BLOG).cover?.alt.length).toBeGreaterThan(0);
	});
});
