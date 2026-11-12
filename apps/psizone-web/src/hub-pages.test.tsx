import { existsSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { HUBS } from "./content/hubs";
import { RICH_HUBS } from "./content/rich";
import type { RichPage } from "./content/rich/types";
import { ROOM_PHOTOS } from "./content/rooms";
import { TEAM } from "./content/team";
import { registerContentPages } from "./content-routes";
import type { Locale } from "./i18n";

/** The six hubs ported from the old psizone.ro. */
const IDS = ["autism", "adhd", "sensory", "speech", "teens", "adults"] as const;
const LOCALES: ReadonlyArray<Locale> = ["ro", "en"];
const PUBLIC = join(import.meta.dirname, "..", "public");

const app = new Hono();
registerContentPages(app, "ro", "");
registerContentPages(app, "en", "/en");

const hubOf = (id: string) => {
	const hub = HUBS.find((h) => h.id === id);
	const page = RICH_HUBS[id];
	if (hub === undefined || page === undefined) throw new Error(`no rich hub ${id}`);
	return { hub, page };
};
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

describe("hubs ported from the old site", () => {
	const titles = new Set<string>();
	for (const id of IDS) {
		const { hub, page } = hubOf(id);
		for (const locale of LOCALES) {
			it(`${url(hub.path, locale)} is a rich page: one h1, unique title, description, hreflang, matching FAQPage`, async () => {
				expect(words(page, locale)).toBeGreaterThanOrEqual(750);
				expect(page.faq.length).toBeGreaterThanOrEqual(5);
				expect(page.faq.length).toBeLessThanOrEqual(8);
				const res = await app.request(url(hub.path, locale));
				expect(res.status).toBe(200);
				const html = await res.text();
				expect(html.match(/<h1[ >]/g)).toHaveLength(1);
				const title = html.match(/<title>(.*?)<\/title>/s)?.[1] ?? "";
				expect(title).toContain("Galați");
				expect(titles.has(title), `duplicate title ${title}`).toBe(false);
				titles.add(title);
				expect(html).toContain('hreflang="ro"');
				expect(html).toContain('hreflang="en"');
				const faq = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
					.map((m) => JSON.parse(m[1] ?? "{}") as { "@type"?: string; mainEntity?: unknown[] })
					.find((j) => j["@type"] === "FAQPage");
				expect(faq?.mainEntity).toHaveLength(page.faq.length);
			});
		}
	}

	it("every photograph on a hub names an existing file and gives size, alt text and lazy loading", async () => {
		for (const id of IDS) {
			const { hub, page } = hubOf(id);
			const photos = page.sections.flatMap((s) => (s.photo === undefined ? [] : [s.photo]));
			for (const locale of LOCALES) {
				const html = await (await app.request(url(hub.path, locale))).text();
				for (const ph of photos) {
					expect(existsSync(join(PUBLIC, ph.src)), ph.src).toBe(true);
					expect(ph.alt[locale].length).toBeGreaterThan(20);
					const tag = html.match(new RegExp(`<img[^>]*src="${ph.src}"[^>]*>`))?.[0] ?? "";
					expect(tag, ph.src).toContain(`width="${ph.width}"`);
					expect(tag, ph.src).toContain(`height="${ph.height}"`);
					expect(tag, ph.src).toContain('loading="lazy"');
				}
			}
		}
	});

	it("the team portraits and room photos exist, one file per person", () => {
		const files = [
			...TEAM.flatMap((p) => (p.portrait === undefined ? [] : [p.portrait.file])),
			...ROOM_PHOTOS.map((p) => p.file),
		];
		expect(new Set(files).size).toBe(files.length);
		for (const f of files)
			expect(existsSync(join(PUBLIC, "images", "old-site", `${f}.webp`)), f).toBe(true);
	});
});
