import { describe, expect, it } from "vitest";
import { eqsyncInvite } from "./invite";
import { PAGES } from "./routes";

describe("EQ-SYNC's invitation", () => {
	it("labels the capsule in the night-time companion's voice, in both languages", () => {
		expect(eqsyncInvite("ro", "/").label).toBe("Nu poți dormi? Întreabă-mă");
		expect(eqsyncInvite("en", "/en").label).toBe("Cannot sleep? Ask me");
	});

	it("starts the field on a question about sleep, and cycles through three", () => {
		expect(eqsyncInvite("ro", "/").placeholders).toEqual([
			"Cum dormi în ultima vreme?",
			"Ce fac când mintea nu se oprește seara?",
			"Cum încep programul gratuit?",
		]);
	});

	it("invites the home's visitor to a calmer evening", () => {
		expect(eqsyncInvite("ro", "/").nudge?.text).toBe(
			"Cauți mai multă liniște seara? Spune-mi cum arată seara ta.",
		);
		expect(eqsyncInvite("en", "/en").nudge?.text).toContain("calmer evening");
	});

	it("offers to start the free programme on the sign-up page, in either language", () => {
		for (const locale of ["ro", "en"] as const) {
			const { nudge, placeholders } = eqsyncInvite(locale, PAGES.signup[locale]);
			expect(nudge?.text, locale).toMatch(/21/);
			expect(nudge?.question, locale).toMatch(/programme|programul/);
			expect(placeholders).toHaveLength(4);
		}
	});

	it("offers a short explanation on any other page", () => {
		expect(eqsyncInvite("ro", PAGES.faq.ro).nudge?.text).toBe(
			"Vrei să-ți explic pe scurt pagina asta?",
		);
		expect(eqsyncInvite("ro", `${PAGES.faq.ro}/`).nudge?.text).toBe(
			"Vrei să-ți explic pe scurt pagina asta?",
		);
	});

	it("reports to the site's own signal route, and writes no exclamation mark or emoji", () => {
		expect(eqsyncInvite("ro", "/").signalUrl).toBe("/ghid/signal");
		expect(eqsyncInvite("en", "/en").signalUrl).toBe("/en/ghid/signal");
		for (const locale of ["ro", "en"] as const) {
			for (const path of ["/", PAGES.signup[locale], PAGES.faq[locale]]) {
				const i = eqsyncInvite(locale, path);
				const all = [i.label, ...i.placeholders, i.nudge?.text, i.nudge?.question].join(" ");
				expect(all).not.toMatch(/!|\p{Extended_Pictographic}/u);
			}
		}
	});
});
