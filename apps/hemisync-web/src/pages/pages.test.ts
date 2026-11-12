import { existsSync, readFileSync, statSync } from "node:fs";
import { ARTICLES } from "@psi/content";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { editionsOf, isoRange } from "../content/editions";
import { PAGE_IDS, PAGES, PROGRAMME_SLUGS, WORKSHOP_IDS, workshopHref } from "../routes";
import { programmeHref } from "../sections/programmes";
import { registerPages } from "./register";

const app = new Hono({ strict: false });
registerPages(app);

const ROUTES: ReadonlyArray<{ locale: "ro" | "en"; path: string }> = (
	["ro", "en"] as const
).flatMap((locale) => [
	...PAGE_IDS.map((id) => ({ locale, path: PAGES[id][locale] })),
	...PROGRAMME_SLUGS.map((slug) => ({ locale, path: programmeHref(locale, slug) })),
	...WORKSHOP_IDS.map((id) => ({ locale, path: workshopHref(locale, id) })),
]);

async function html(path: string): Promise<string> {
	const r = await app.request(path);
	expect(r.status, path).toBe(200);
	return r.text();
}

const Bundle = z.record(z.string());
const BUNDLES = {
	ro: Bundle.parse(JSON.parse(readFileSync("messages/content/ro.json", "utf8"))),
	en: Bundle.parse(JSON.parse(readFileSync("messages/content/en.json", "utf8"))),
};
const JsonLdScript = z.record(z.unknown());

describe("hemisync pages", () => {
	it("answers 200 for every page, programme and workshop type, in both languages", async () => {
		for (const { path } of ROUTES) await html(path);
		expect(ROUTES.length).toBe(
			2 * (PAGE_IDS.length + PROGRAMME_SLUGS.length + WORKSHOP_IDS.length),
		);
	});

	it("answers 404 for an unknown programme or workshop slug", async () => {
		for (const path of [
			"/programe/nu-exista",
			"/en/programmes/nope",
			"/programe/arhiva/nu-exista",
		]) {
			expect((await app.request(path)).status, path).toBe(404);
		}
	});

	it("gives every page exactly one h1", async () => {
		for (const { path } of ROUTES) {
			const page = await html(path);
			expect(page.match(/<h1[\s>]/g)?.length, path).toBe(1);
		}
	});

	it("gives every page its own title of at most 65 characters and a description", async () => {
		const seen = new Map<string, string>();
		for (const { locale, path } of ROUTES) {
			const page = await html(path);
			const title = /<title>([^<]*)<\/title>/.exec(page)?.[1] ?? "";
			const description = /<meta name="description" content="([^"]*)"/.exec(page)?.[1] ?? "";
			expect(title.length, `${path} title`).toBeGreaterThan(10);
			expect(title.length, `${path} title: ${title}`).toBeLessThanOrEqual(65);
			expect(description.length, `${path} description`).toBeGreaterThan(60);
			expect(description.length, `${path} description`).toBeLessThanOrEqual(200);
			const key = `${locale}:${title}`;
			expect(seen.get(key), `${path} repeats the title of ${seen.get(key)}`).toBeUndefined();
			seen.set(key, path);
		}
	});

	it("pairs every page with its other language through hreflang and a canonical", async () => {
		for (const { locale, path } of ROUTES) {
			const page = await html(path);
			expect(page, path).toContain('rel="canonical"');
			expect(page, path).toContain('hreflang="ro"');
			expect(page, path).toContain('hreflang="en"');
			expect(page, path).toContain('hreflang="x-default"');
			expect(page, path).toContain(`<html lang="${locale}"`);
		}
	});

	it("links only to pages that exist", async () => {
		const known = new Set(ROUTES.map((r) => r.path));
		const outside = new Set(["/", "/en", "/en/", "/ghid", "/en/ghid"]);
		for (const { path } of ROUTES) {
			const page = await html(path);
			for (const [, link] of page.matchAll(/<a [^>]*href="(\/[^"#?]*)/g)) {
				const target = link ?? "";
				if (outside.has(target)) continue;
				if (/^(\/en)?\/(auth|cont|admin|__)/.test(target)) continue;
				expect(known.has(target), `${path} links to ${target}`).toBe(true);
			}
		}
	});
});

describe("hemisync structured data", () => {
	const nodes = (page: string): Array<Record<string, unknown>> =>
		[...page.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) =>
			JsonLdScript.parse(JSON.parse(m[1] ?? "{}")),
		);

	it("prints the FAQPage of the FAQ with every question shown", async () => {
		for (const locale of ["ro", "en"] as const) {
			const page = await html(PAGES.faq[locale]);
			const faq = nodes(page).find((n) => n["@type"] === "FAQPage");
			const questions = z.array(z.unknown()).parse(faq?.mainEntity ?? []);
			expect(questions.length).toBeGreaterThanOrEqual(15);
			expect(questions.length).toBeLessThanOrEqual(25);
			expect(page.match(/<details class="group/g)?.length).toBe(questions.length);
		}
	});

	it("prints an Event only for editions whose year is confirmed, and no offer", async () => {
		const archive = nodes(await html(PAGES.archive.ro)).filter((n) => n["@type"] === "Event");
		const confirmed = editionsOf().filter((e) => isoRange(e) !== null);
		expect(archive.length).toBe(confirmed.length);
		expect(editionsOf().length).toBeGreaterThan(confirmed.length);
		for (const e of archive) {
			expect(e.offers).toBeUndefined();
			expect(e.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		}
		const optimise = nodes(await html(workshopHref("ro", "optimise"))).filter(
			(n) => n["@type"] === "Event",
		);
		expect(optimise.map((e) => e.startDate)).toEqual(["2023-04-01"]);
		const none = nodes(await html(workshopHref("ro", "creative"))).filter(
			(n) => n["@type"] === "Event",
		);
		expect(none).toEqual([]);
	});

	it("says plainly that an edition's year is unconfirmed instead of guessing it", async () => {
		const page = await html(workshopHref("en", "consciousness"));
		expect(page).toContain("not confirmed");
		expect(page).not.toContain("2019");
	});
});

describe("hemisync content bundle", () => {
	it("has the same keys in both languages", () => {
		expect(Object.keys(BUNDLES.en).sort()).toEqual(Object.keys(BUNDLES.ro).sort());
	});

	it("writes Romanian with comma-below diacritics and typographic quotes", () => {
		for (const [key, value] of Object.entries(BUNDLES.ro)) {
			expect(value, key).not.toMatch(/[şţŞŢ]/);
			expect(value, key).not.toContain('"');
		}
	});

	it("links to blog articles, pages, workshops and programmes that exist", () => {
		const slugs = new Set(ARTICLES.map((a) => a.slug));
		for (const [key, value] of Object.entries({ ...BUNDLES.ro, ...BUNDLES.en })) {
			for (const [, kind, id = ""] of value.matchAll(/\]\(([a-z]+):([^)]+)\)/g)) {
				if (kind === "art") expect(slugs.has(id), `${key}: ${id}`).toBe(true);
				if (kind === "page")
					expect(
						PAGE_IDS.some((p) => p === id),
						`${key}: ${id}`,
					).toBe(true);
				if (kind === "ws")
					expect(
						WORKSHOP_IDS.some((w) => w === id),
						key,
					).toBe(true);
				if (kind === "prog")
					expect(
						PROGRAMME_SLUGS.some((p) => p === id),
						key,
					).toBe(true);
			}
		}
	});

	it("never carries a wording the voice rules forbid", () => {
		for (const [key, value] of Object.entries(BUNDLES.ro)) {
			expect(value, key).not.toMatch(
				/revoluționar|miraculos|garantăm|demonstrat științific|atestat clinic/i,
			);
		}
	});
});

describe("hemisync old-site images", () => {
	const files = [
		"optimise-your-life-galati-2023.webp",
		"online-workshop-2025.webp",
		"seven-meditations.webp",
	];

	it("are at most 400 KB and have alt text in both languages", () => {
		for (const f of files) {
			const path = `public/images/old-site/${f}`;
			expect(existsSync(path), f).toBe(true);
			expect(statSync(path).size, f).toBeLessThanOrEqual(400 * 1024);
		}
		for (const key of [
			"img_monroe_alt",
			"arch_poster_optimise",
			"arch_poster_online",
			"arch_poster_seven",
		]) {
			expect(BUNDLES.ro[key]?.length, key).toBeGreaterThan(20);
			expect(BUNDLES.en[key]?.length, key).toBeGreaterThan(20);
		}
	});
});
