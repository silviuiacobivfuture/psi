import { readFileSync } from "node:fs";
import { mp3Info } from "@psi/ui/testing";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { registerPages } from "../pages/register";
import { PAGES } from "../routes";
import { DEMO_SOUNDS } from "./demo-sounds";

const app = new Hono({ strict: false });
registerPages(app);

const TITLES = {
	ro: ["Coborâre în relaxare", "Respirație și liniște", "Spre somn"],
	en: ["Easing down into relaxation", "Breath and stillness", "Towards sleep"],
} as const;

describe("the demo sounds' files", () => {
	let total = 0;
	for (const d of DEMO_SOUNDS) {
		it(`${d.src} exists, is plain 48 kHz stereo and lasts ${d.seconds} s`, () => {
			const bytes = readFileSync(`public${d.src}`);
			total += bytes.length;
			const info = mp3Info(bytes);
			expect(info.channelModes, "plain stereo, no joint/mono").toEqual([0]);
			expect(info.sampleRate).toBe(48000);
			expect(Math.abs(info.seconds - d.seconds)).toBeLessThan(1);
		});
	}
	it("stay within the size budget (12 MB for all)", () => {
		expect(total).toBeLessThanOrEqual(12 * 1024 * 1024);
	});
});

describe("the demo sounds on the exercises page", () => {
	for (const locale of ["ro", "en"] as const) {
		it(`renders three players with titles, honest notes and descriptions in ${locale}`, async () => {
			const r = await app.request(PAGES.exercises[locale]);
			expect(r.status).toBe(200);
			const html = await r.text();
			for (const d of DEMO_SOUNDS) {
				expect(html).toContain(`src="${d.src}"`);
				expect(html).toContain(`id="${d.id}-heard"`);
				expect(html).toContain(`aria-describedby="${d.id}-heard"`);
			}
			for (const title of TITLES[locale]) expect(html).toContain(title);
			expect(html).toMatch(locale === "ro" ? /Doar cu căști/ : /Headphones only/);
			expect(html).toMatch(locale === "ro" ? /epilepsie/ : /epilepsy/);
			expect(html).toMatch(
				locale === "ro" ? /nu sunt înregistrări Hemi-Sync®/i : /not Hemi-Sync® recordings/i,
			);
			expect(html).not.toMatch(/<audio[^>]*\bautoplay\b/);
			expect(html.match(/<audio[^>]*preload="none"/g)?.length).toBeGreaterThanOrEqual(3);
		});
	}
});
