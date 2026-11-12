import { describe, expect, it } from "vitest";
import { blogInvite } from "./invite";
import { routes } from "./routes";

describe("the Blog's invitation", () => {
	it("labels the capsule, in both languages", () => {
		expect(blogInvite("ro", "/").label).toBe("Caută sau întreabă");
		expect(blogInvite("en", "/en").label).toBe("Search or ask");
	});

	it("starts the field on a question about what to read, and cycles through three", () => {
		expect(blogInvite("ro", "/").placeholders).toEqual([
			"Ce vrei să afli astăzi?",
			"Caută un subiect sau pune o întrebare…",
			"Ce articol ți-ar folosi acum?",
		]);
	});

	it("offers to explain an article in short, on the article's own route, in both languages", () => {
		for (const locale of ["ro", "en"] as const) {
			const i = blogInvite(locale, routes.article(locale, "somnul-la-copii"));
			expect(i.nudge?.text).toBe(
				locale === "ro"
					? "Vrei să-ți explic articolul pe scurt?"
					: "Would you like a short explanation of this article?",
			);
			expect(i.nudge?.question).toMatch(/articol|article/);
			expect(i.placeholders[0]).toMatch(/articol|article/);
		}
	});

	it("is not fooled by the articles' own prefix with no article under it", () => {
		const [before = ""] = routes.article("ro", "\0").split("\0");
		expect(blogInvite("ro", before).nudge?.text).not.toContain("articolul");
	});

	it("asks what interests the visitor on the home, and offers a short explanation elsewhere", () => {
		expect(blogInvite("ro", "/").nudge?.text).toContain("Cauți ceva anume?");
		expect(blogInvite("en", "/en").nudge?.text).toContain("Looking for something");
		expect(blogInvite("ro", "/cont").nudge?.text).toBe("Vrei să-ți explic pe scurt pagina asta?");
	});

	it("reports to the site's own signal route, and writes no exclamation mark or emoji", () => {
		expect(blogInvite("ro", "/").signalUrl).toBe("/ghid/signal");
		expect(blogInvite("en", "/en").signalUrl).toBe("/en/ghid/signal");
		for (const locale of ["ro", "en"] as const) {
			for (const path of ["/", routes.article(locale, "x"), "/cont"]) {
				const i = blogInvite(locale, path);
				const all = [i.label, ...i.placeholders, i.nudge?.text, i.nudge?.question].join(" ");
				expect(all).not.toMatch(/!|\p{Extended_Pictographic}/u);
			}
		}
	});
});
