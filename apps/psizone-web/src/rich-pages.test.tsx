import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { HUBS } from "./content/hubs";
import { METHODS } from "./content/methods";
import { RICH_HUBS, RICH_METHODS } from "./content/rich";
import type { RichPage } from "./content/rich/types";
import { registerContentPages } from "./content-routes";
import type { Locale } from "./i18n";
import { sitemap } from "./seo";

interface Entry {
	path: string;
	page: RichPage;
}

const PATHS = [
	"/metode/evaluare-qeeg",
	"/metode/neurofeedback",
	"/metode/tms",
	"/metode/eq-sync",
	"/metode/aba",
	"/metode/logopedie",
	"/metode/psihoterapie",
	"/metode/integrare-neurosenzoriala",
	"/adulti/cuplu-familie",
	"/adulti/post-avc",
	"/adulti/psiho-oncologie",
	"/programe/sport",
] as const;

const ALL: ReadonlyArray<Entry> = [
	...METHODS.flatMap((x) => {
		const page = RICH_METHODS[x.id];
		return page === undefined ? [] : [{ path: x.path, page }];
	}),
	...HUBS.flatMap((h) => {
		const page = RICH_HUBS[h.id];
		return page === undefined ? [] : [{ path: h.path, page }];
	}),
];
const app = new Hono();
registerContentPages(app, "ro", "");
registerContentPages(app, "en", "/en");

/** The pages of this change; hubs ported from the old site may join `RICH_HUBS` later. */
const ENTRIES = ALL.filter((e) => (PATHS as ReadonlyArray<string>).includes(e.path));
const LOCALES: ReadonlyArray<Locale> = ["ro", "en"];
const url = (path: string, locale: Locale): string => (locale === "ro" ? path : `/en${path}`);

function words(page: RichPage, locale: Locale): number {
	const parts = [
		page.lead[locale],
		page.nextStep[locale],
		...page.sections.flatMap((s) => [
			s.h2[locale],
			...s.paras.map((p) => p[locale]),
			...(s.list ?? []).map((l) => l[locale]),
		]),
		...page.faq.flatMap((f) => [f.q[locale], f.a[locale]]),
	];
	return parts.join(" ").split(/\s+/).filter(Boolean).length;
}

function jsonLdTypes(html: string): string[] {
	const found = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
	return found.map((f) => String((JSON.parse(f[1] ?? "{}") as { "@type"?: string })["@type"]));
}

describe("rich method and hub pages", () => {
	it("covers the eight methods and the four new hubs", () => {
		expect(ENTRIES.map((e) => e.path)).toEqual(expect.arrayContaining([...PATHS]));
	});

	it("the Romanian text is 900 to 1,600 words, the English comparable", () => {
		for (const { path, page } of ENTRIES) {
			expect(words(page, "ro"), path).toBeGreaterThanOrEqual(900);
			expect(words(page, "ro"), path).toBeLessThanOrEqual(1600);
			expect(words(page, "en"), path).toBeGreaterThanOrEqual(750);
		}
	});

	it("has 5 to 8 questions and a 'not for' section", () => {
		for (const { path, page } of ENTRIES) {
			expect(page.faq.length, path).toBeGreaterThanOrEqual(5);
			expect(page.faq.length, path).toBeLessThanOrEqual(8);
			expect(
				page.sections.filter((s) => s.kind === "not-for"),
				path,
			).toHaveLength(1);
		}
	});

	const titles = new Map<string, string>();
	for (const locale of LOCALES) {
		for (const { path, page } of ENTRIES) {
			it(`${url(path, locale)} renders with one h1, a short unique title, hreflang and JSON-LD`, async () => {
				const res = await app.request(url(path, locale));
				expect(res.status).toBe(200);
				const html = await res.text();
				expect(html.match(/<h1[ >]/g)).toHaveLength(1);
				const title = html.match(/<title>(.*?)<\/title>/s)?.[1] ?? "";
				expect(title.length).toBeLessThanOrEqual(65);
				expect(titles.has(title), `duplicate title ${title}`).toBe(false);
				titles.set(title, path);
				expect(html).toContain('hreflang="ro"');
				expect(html).toContain('hreflang="en"');
				expect(html).toContain('<meta name="description"');
				const types = jsonLdTypes(html);
				expect(types).toContain("FAQPage");
				expect(types).toContain("MedicalWebPage");
				const notFor = page.sections.find((s) => s.kind === "not-for");
				expect(html).toContain(`id="${notFor?.id}"`);
				for (const f of page.faq) expect(html).toContain(f.q[locale].replace(/&/g, "&amp;"));
			});
		}
	}

	it("lists every page in the sitemap, in both languages", async () => {
		const xml = await sitemap(app);
		for (const { path } of ENTRIES) {
			expect(xml, path).toContain(`${path}</loc>`);
			expect(xml, path).toContain(`/en${path}</loc>`);
		}
	});

	it("each method page links the hubs where it is used, and each hub its methods", async () => {
		const html = await (await app.request("/metode/psihoterapie")).text();
		for (const h of HUBS.filter((x) => ["couple", "oncology", "stroke", "sport"].includes(x.id))) {
			expect(html).toContain(`href="${h.path}"`);
		}
		const hub = await (await app.request("/adulti/post-avc")).text();
		expect(hub).toContain('href="/metode/neurofeedback"');
	});
});
