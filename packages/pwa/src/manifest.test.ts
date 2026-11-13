import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PWA_BRANDS, token } from "./brand";
import { buildManifest, ICON_FILES, WebAppManifestSchema } from "./manifest";

const TEXT = { name: "Psizone — evaluare", shortName: "Psizone", description: "Centru." };
const APP: Record<string, string> = {
	psizone: "psizone-web",
	eqsync: "eqsync-web",
	hemisync: "hemisync-web",
	blog: "blog-web",
	clinic: "clinic",
};

describe("buildManifest", () => {
	it("builds a valid, installable manifest for every brand and locale", () => {
		for (const brand of PWA_BRANDS) {
			for (const [lang, startUrl] of [
				["ro", "/"],
				["en", "/en"],
			] as const) {
				const m = buildManifest({ brand, lang, startUrl, text: TEXT });
				expect(WebAppManifestSchema.safeParse(m).success).toBe(true);
				expect(m).toMatchObject({ lang, start_url: startUrl, scope: "/", display: "standalone" });
			}
		}
	});

	it("keeps one id across locales, so Romanian and English are one installed app", () => {
		const ro = buildManifest({ brand: "eqsync", lang: "ro", startUrl: "/", text: TEXT });
		const en = buildManifest({ brand: "eqsync", lang: "en", startUrl: "/en", text: TEXT });
		expect(ro.id).toBe(en.id);
		expect(ro.start_url).not.toBe(en.start_url);
	});

	it("takes its colours from the brand's default theme tokens", () => {
		const m = buildManifest({ brand: "psizone", lang: "ro", startUrl: "/", text: TEXT });
		expect(m.theme_color).toBe(token("bg", "psizone-light"));
		expect(m.background_color).toBe("#F4EEE2");
		expect(
			buildManifest({ brand: "eqsync", lang: "ro", startUrl: "/", text: TEXT }).theme_color,
		).toBe(token("bg", "eqsync-dark"));
	});

	it("lists any and maskable icons at 192 and 512, never the apple or badge files", () => {
		const m = buildManifest({ brand: "blog", lang: "ro", startUrl: "/", text: TEXT });
		expect(m.icons.map((i) => `${i.sizes}:${i.purpose}`).sort()).toEqual([
			"192x192:any",
			"192x192:maskable",
			"512x512:any",
			"512x512:maskable",
		]);
	});

	it("refuses a short name too long for a home screen", () => {
		expect(() =>
			buildManifest({
				brand: "blog",
				lang: "ro",
				startUrl: "/",
				text: { ...TEXT, shortName: "A name far too long for an icon" },
			}),
		).toThrow();
	});

	it("points at icons the pipeline has generated in every app", () => {
		for (const brand of PWA_BRANDS) {
			for (const icon of ICON_FILES) {
				const file = fileURLToPath(
					new URL(`../../../apps/${APP[brand]}/public/assets/pwa/${icon.file}`, import.meta.url),
				);
				expect(existsSync(file), file).toBe(true);
			}
		}
	});
});
