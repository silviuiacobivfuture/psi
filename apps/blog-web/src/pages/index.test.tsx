import { describe, expect, it } from "vitest";
import { listing } from "../content/articles";
import { IndexPage, PAGE_SIZE } from "./index";

function render(props: Partial<Parameters<typeof IndexPage>[0]> = {}): string {
	return String(<IndexPage locale="ro" theme="blog-dark" origin="http://localhost" {...props} />);
}

/** The picture of each card on the page: its `<img>` tag, or undefined when it shows ambient art. */
function cardMedia(html: string): Array<string | undefined> {
	return html
		.split('class="pz-article__media')
		.slice(1)
		.map((chunk) => /<img [^>]*>/.exec(chunk.slice(0, 1200))?.[0]);
}

describe("the index shows pictures", () => {
	it("gives every card a photo with alt text, and the lead story its photo", () => {
		const html = render();
		const media = cardMedia(html);
		expect(media.length).toBeGreaterThan(0);
		for (const img of media) {
			expect(img, "a card without a photo").toBeDefined();
			expect(img).toMatch(/alt="[^"]+"/);
		}
		expect(html).toContain("bl-featured__media");
		expect(html).not.toContain("pz-cover__art");
	});

	it("loads only the lead story eagerly; cards stay lazy", () => {
		const html = render();
		expect(html.match(/fetchpriority="high"/g)).toHaveLength(1);
		for (const img of cardMedia(html)) expect(img).toContain('loading="lazy"');
	});

	it("never renders more than a page of cards for a filtered listing", () => {
		const html = render({ brand: "eqsync" });
		expect(cardMedia(html).length).toBeLessThanOrEqual(PAGE_SIZE);
	});

	it("says which page it is on when a listing has several", () => {
		const total = listing({ brand: "eqsync" }).length;
		const html = render({ brand: "eqsync", page: 2 });
		if (total > PAGE_SIZE) expect(html).toContain('rel="prev"');
		else expect(html).not.toContain('rel="next"');
	});
});
