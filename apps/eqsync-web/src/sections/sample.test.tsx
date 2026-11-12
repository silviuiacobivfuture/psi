import { readFileSync } from "node:fs";
import { mp3Info } from "@psi/ui/testing";
import { describe, expect, it } from "vitest";
import { Sample } from "./sample";

describe("the home page's demo sound", () => {
	it("points at a real stereo MP3 of 2:00 under 2.5 MB, 48 kHz", () => {
		const info = mp3Info(readFileSync("public/assets/sample.mp3"));
		expect(info.channelModes, "plain stereo, no joint/mono").toEqual([0]);
		expect(info.sampleRate).toBe(48000);
		expect(info.seconds).toBeGreaterThanOrEqual(119.5);
		expect(info.seconds).toBeLessThanOrEqual(121);
		expect(readFileSync("public/assets/sample.mp3").length).toBeLessThan(2.5 * 1024 * 1024);
	});

	for (const [locale, title, headphones, safety, heard] of [
		["ro", "Seară · demo", /Doar cu căști/, /epilepsie/, /Ce vei auzi/],
		["en", "Evening · demo", /Headphones only/, /epilepsy/, /What you will hear/],
	] as const) {
		it(`renders the player with title, headphones note, safety note and description in ${locale}`, async () => {
			const html = String(<Sample locale={locale} />);
			expect(html).toContain('src="/assets/sample.mp3"');
			expect(html).toContain('preload="none"');
			expect(html).not.toMatch(/<audio[^>]*\bautoplay\b/);
			expect(html).toContain(title);
			expect(html).toMatch(headphones);
			expect(html).toMatch(safety);
			expect(html).toMatch(heard);
			expect(html).toContain('aria-describedby="sample-heard"');
			expect(html).toContain('id="sample-heard"');
		});
	}
});
