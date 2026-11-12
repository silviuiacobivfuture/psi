import { existsSync } from "node:fs";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { ALIASES, PAGES, type PageId } from "../routes";
import { Footer } from "../sections/closing";
import { Header } from "../sections/header";
import { sitemap } from "../seo";
import { PROSE } from "./content-spec";
import { FaqPage } from "./faq";
import { HomePage } from "./home";
import { msg, sectionKeys } from "./prose";
import { registerPages } from "./register";

const app = new Hono({ strict: false });
registerPages(app);
app.get("/sitemap.xml", async (c) =>
	c.body(await sitemap(app), 200, { "content-type": "application/xml" }),
);

const LOCALES = ["ro", "en"] as const;
/** The content pages this work deepened or added. */
const CONTENT: ReadonlyArray<PageId> = [
	"method",
	"protocols",
	"faq",
	"about",
	"safety",
	"science",
	"listen",
	"glossary",
	"who",
];
const NEW: ReadonlyArray<PageId> = ["science", "listen", "glossary", "who"];
const HEADPHONES = { ro: /căști/i, en: /headphones/i } as const;

async function page(locale: "ro" | "en", id: PageId) {
	const r = await app.request(PAGES[id][locale]);
	return { status: r.status, html: await r.text() };
}

const tag = (html: string, re: RegExp) => re.exec(html)?.[1];
const jsonLd = (html: string): ReadonlyArray<Record<string, unknown>> =>
	[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
		(m) => JSON.parse(m[1] ?? "{}") as Record<string, unknown>,
	);
const main = (html: string) => tag(html, /<main[^>]*>([\s\S]*)<\/main>/) ?? "";
const words = (html: string) =>
	main(html)
		.replace(/<[^>]+>/g, " ")
		.split(/\s+/)
		.filter(Boolean).length;

describe("every content page", () => {
	const descriptions = new Map<string, string>();
	for (const locale of LOCALES) {
		for (const id of CONTENT) {
			it(`${id} (${locale}): renders with one h1, a short title, its own description, hreflang`, async () => {
				const { status, html } = await page(locale, id);
				expect(status).toBe(200);
				expect(html.match(/<h1[ >]/g)).toHaveLength(1);
				const title = tag(html, /<title>([^<]*)<\/title>/) ?? "";
				expect(title.length).toBeGreaterThan(10);
				expect(title.length).toBeLessThanOrEqual(65);
				const desc = tag(html, /<meta name="description" content="([^"]*)"/) ?? "";
				expect(desc.length).toBeGreaterThan(60);
				expect(desc.length).toBeLessThanOrEqual(180);
				const key = `${locale}|${desc}`;
				expect(descriptions.has(key), `description of ${id} repeats ${descriptions.get(key)}`).toBe(
					false,
				);
				descriptions.set(key, id);
				expect(html).toContain('rel="canonical"');
				expect(html).toContain(`hreflang="${locale === "ro" ? "en" : "ro"}"`);
				expect(html).toContain('hreflang="x-default"');
			});

			it(`${id} (${locale}): says headphones, carries no percentage and no cedilla s or t`, async () => {
				const { html } = await page(locale, id);
				const text = main(html).replace(/<[^>]+>/g, " ");
				expect(text).toMatch(HEADPHONES[locale]);
				expect(text).not.toContain("%");
				expect(text).not.toMatch(/[şţŞŢ]/);
			});
		}
	}

	it("lists every page of both languages in the sitemap", async () => {
		const xml = await (await app.request("/sitemap.xml")).text();
		for (const id of CONTENT) for (const l of LOCALES) expect(xml).toContain(PAGES[id][l]);
	});

	it("has a message for every key of every long-form section, in both languages", () => {
		for (const k of Object.keys(PROSE) as Array<keyof typeof PROSE>) {
			for (const key of sectionKeys(k))
				for (const l of LOCALES) expect(msg(l, key).length).toBeGreaterThan(1);
		}
	});

	it("has no section beyond the ones the spec lists", () => {
		for (const k of Object.keys(PROSE) as Array<keyof typeof PROSE>) {
			for (const s of PROSE[k]) {
				expect(() => msg("ro", `${k}_${s.id}_p${s.p + 1}`)).toThrow();
				expect(() => msg("ro", `${k}_${s.id}_l${s.l + 1}`)).toThrow();
			}
		}
	});

	it("keeps the Romanian text deep enough to rank: the new pages carry at least 400 words", async () => {
		for (const id of NEW) expect(words((await page("ro", id)).html), id).toBeGreaterThan(400);
	});
});

describe("the FAQ", () => {
	for (const locale of LOCALES) {
		it(`prints FAQPage structured data for exactly the questions on the page (${locale})`, async () => {
			const { html } = await page(locale, "faq");
			const faq = jsonLd(html).find((n) => n["@type"] === "FAQPage");
			const entities = (faq?.mainEntity ?? []) as ReadonlyArray<{ name: string }>;
			const details = html.match(/<details class="eq-faq__item"/g)?.length ?? 0;
			expect(entities.length).toBe(details);
			expect(details).toBeGreaterThanOrEqual(15);
			expect(details).toBeLessThanOrEqual(25);
			const h3 = [...html.matchAll(/<h3 class="eq-faq__q">([^<]*)<\/h3>/g)].map((m) => m[1]);
			expect(h3).toHaveLength(details);
			expect(new Set(entities.map((e) => e.name)).size).toBe(entities.length);
		});
	}

	it("is the only page with FAQPage data", async () => {
		for (const id of CONTENT.filter((p) => p !== "faq")) {
			const { html } = await page("ro", id);
			expect(
				jsonLd(html).some((n) => n["@type"] === "FAQPage"),
				id,
			).toBe(false);
		}
	});

	it("renders without the app (component call)", () => {
		expect(String(FaqPage({ locale: "ro", theme: "eqsync-dark", origin: "http://x" }))).toContain(
			"<details",
		);
	});
});

describe("the science page", () => {
	it("links the three papers it cites and prints Article data", async () => {
		const { html } = await page("ro", "science");
		for (const url of [
			"pmc.ncbi.nlm.nih.gov/articles/PMC10198548/",
			"pmc.ncbi.nlm.nih.gov/articles/PMC4428073/",
			"pubmed.ncbi.nlm.nih.gov/30073406/",
		])
			expect(html).toContain(url);
		expect(jsonLd(html).some((n) => n["@type"] === "Article")).toBe(true);
	});

	it("does not claim the studies treat anything", async () => {
		for (const l of LOCALES) {
			const text = main((await page(l, "science")).html);
			expect(text).not.toMatch(/revoluționar|miraculos|garantat|breakthrough|miracle|guaranteed/i);
		}
	});
});

describe("the glossary", () => {
	it("prints a DefinedTermSet for the terms on the page", async () => {
		const { html } = await page("en", "glossary");
		const set = jsonLd(html).find((n) => n["@type"] === "DefinedTermSet");
		const terms = (set?.hasDefinedTerm ?? []) as ReadonlyArray<unknown>;
		expect(terms).toHaveLength(PROSE.gl.length);
	});
});

describe("the safety page", () => {
	it("names epilepsy and the doctor's agreement, and the 112 line, exactly", async () => {
		const ro = main((await page("ro", "safety")).html);
		expect(ro).toContain("epilepsie");
		expect(ro).toContain("acordul medicului");
		expect(ro).toContain("Dacă tu sau cineva apropiat sunteți în pericol imediat, sunați la 112.");
		const en = main((await page("en", "safety")).html);
		expect(en).toContain("epilepsy");
		expect(en).toContain("without their doctor");
		expect(en).toContain("If you or someone close to you is in immediate danger, call 112.");
		expect(en).toContain("not a medical device");
	});
});

describe("navigation to the new pages", () => {
	for (const locale of LOCALES) {
		it(`the compass and the footer link them (${locale})`, () => {
			const html = String(Header({ locale, otherHref: "/" })) + String(Footer({ locale }));
			for (const id of NEW) expect(html).toContain(`href="${PAGES[id][locale]}"`);
		});
	}

	it("answers the Romanian slug under /en with a 301 to the English path", async () => {
		for (const [from, id] of ALIASES.filter(([, id]) => NEW.includes(id))) {
			const r = await app.request(from);
			expect(r.status).toBe(301);
			expect(r.headers.get("location")).toBe(PAGES[id].en);
		}
	});
});

/** The photographs of each page: how many `<img>` the content area carries, and how many load eagerly. */
const PHOTOS: ReadonlyArray<{ path: { ro: string; en: string }; images: number; eager: number }> = [
	{ path: PAGES.method, images: 4, eager: 0 },
	{ path: PAGES.science, images: 2, eager: 0 },
	{ path: PAGES.listen, images: 2, eager: 0 },
	{ path: PAGES.who, images: 2, eager: 0 },
	{ path: PAGES.glossary, images: 1, eager: 1 },
	{ path: PAGES.about, images: 1, eager: 1 },
	{ path: PAGES.protocols, images: 1, eager: 1 },
	{ path: PAGES.faq, images: 1, eager: 1 },
];

const homeApp = new Hono();
for (const [path, locale] of [
	["/", "ro"],
	["/en", "en"],
] as const) {
	homeApp.get(path, (c) =>
		c.html(<HomePage locale={locale} theme="eqsync-dark" origin="http://localhost" />),
	);
}

const imgs = (html: string): ReadonlyArray<string> => html.match(/<img [^>]*>/g) ?? [];
const attr = (img: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(img)?.[1];

describe("photographs", () => {
	for (const locale of LOCALES) {
		for (const { path, images, eager } of PHOTOS) {
			it(`${path[locale]} (${locale}): ${images} photographs, each with alt, size and files on disk`, async () => {
				const r = await app.request(path[locale]);
				expect(r.status).toBe(200);
				const found = imgs(main(await r.text())).filter((i) =>
					attr(i, "src")?.startsWith("/assets/images/"),
				);
				expect(found).toHaveLength(images);
				for (const img of found) {
					expect((attr(img, "alt") ?? "").length, img).toBeGreaterThan(20);
					expect(Number(attr(img, "width")), img).toBeGreaterThan(0);
					expect(Number(attr(img, "height")), img).toBeGreaterThan(0);
					for (const src of (attr(img, "srcset") ?? "").split(", ")) {
						const file = src.split(" ")[0] ?? "";
						expect(existsSync(`public${file}`), file).toBe(true);
					}
				}
				expect(found.filter((i) => attr(i, "loading") === "eager")).toHaveLength(eager);
				expect(found.filter((i) => attr(i, "loading") === "lazy")).toHaveLength(images - eager);
			});
		}
	}

	for (const [path, locale] of [
		["/", "ro"],
		["/en", "en"],
	] as const) {
		it(`${path} (${locale}): the hero, Problem, Method and Sample photographs have alt and size`, async () => {
			const found = imgs(main(await (await homeApp.request(path)).text())).filter((i) =>
				attr(i, "src")?.startsWith("/assets/images/"),
			);
			expect(found).toHaveLength(4);
			for (const img of found) {
				expect((attr(img, "alt") ?? "").length, img).toBeGreaterThan(20);
				expect(Number(attr(img, "width")), img).toBeGreaterThan(0);
			}
			expect(found.filter((i) => attr(i, "loading") === "eager")).toHaveLength(1);
		});
	}

	it("describes each photograph differently in Romanian and in English", async () => {
		for (const { path } of PHOTOS) {
			const ro = imgs(main(await (await app.request(path.ro)).text())).map((i) => attr(i, "alt"));
			const en = imgs(main(await (await app.request(path.en)).text())).map((i) => attr(i, "alt"));
			expect(ro.length).toBe(en.length);
			for (const [i, alt] of ro.entries()) expect(alt, path.ro).not.toBe(en[i]);
		}
	});
});
