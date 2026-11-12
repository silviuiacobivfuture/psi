import { ORIGINS } from "@psi/content";
import { describe, expect, it } from "vitest";
import { FromTheBlog } from "./blog";

describe("From the blog", () => {
	for (const locale of ["ro", "en"] as const) {
		it(`shows each card's blog cover from the blog's own origin (${locale})`, () => {
			const html = String(<FromTheBlog locale={locale} />);
			const imgs = html.match(/<img [^>]*>/g) ?? [];
			expect(imgs.length).toBeGreaterThan(0);
			for (const img of imgs) {
				expect(img).toContain(`src="${ORIGINS.blog}/assets/images/`);
				expect(img).toMatch(/alt="[^"]+"/);
			}
			expect(html).not.toContain("pz-ambient");
		});
	}
});
