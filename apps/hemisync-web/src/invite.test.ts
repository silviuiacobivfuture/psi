import { describe, expect, it } from "vitest";
import { hemisyncInvite } from "./invite";
import { PAGES } from "./routes";

describe("Hemi-Sync's invitation", () => {
	it("labels the capsule in the guide of inner journeys' voice, in both languages", () => {
		expect(hemisyncInvite("ro", "/").label).toBe("Cu ce începi? Întreabă ghidul");
		expect(hemisyncInvite("en", "/en").label).toBe("Where to begin? Ask the guide");
	});

	it("starts the field on an invitation to explore, and cycles through three", () => {
		expect(hemisyncInvite("ro", "/").placeholders).toEqual([
			"Ce ai vrea să explorezi?",
			"Cu ce program să încep?",
			"Ce este un nivel Focus?",
		]);
	});

	it("invites a programme page's visitor to say what they want to explore", () => {
		for (const locale of ["ro", "en"] as const) {
			for (const path of [PAGES.programmes[locale], `${PAGES.programmes[locale]}/gateway-voyage`]) {
				const i = hemisyncInvite(locale, path);
				expect(i.nudge?.text, path).toMatch(/programme|program/);
				expect(i.placeholders[0], path).toMatch(/program/);
			}
		}
		expect(hemisyncInvite("ro", "/programe/gateway-voyage").nudge?.text).toBe(
			"Cauți un program? Spune-mi ce vrei să explorezi.",
		);
	});

	it("offers to choose a programme or a workshop on the contact page", () => {
		expect(hemisyncInvite("ro", PAGES.contact.ro).nudge?.text).toBe(
			"Te ajut să alegi un program sau un atelier?",
		);
		expect(hemisyncInvite("en", PAGES.contact.en).nudge?.text).toContain("workshop");
	});

	it("asks where to begin on the home, and offers a short explanation elsewhere", () => {
		expect(hemisyncInvite("ro", "/").nudge?.question).toBe("Cu ce program să încep?");
		expect(hemisyncInvite("ro", PAGES.glossary.ro).nudge?.text).toBe(
			"Vrei să-ți explic pe scurt pagina asta?",
		);
	});

	it("reports to the site's own signal route, and writes no exclamation mark or emoji", () => {
		expect(hemisyncInvite("ro", "/").signalUrl).toBe("/ghid/signal");
		expect(hemisyncInvite("en", "/en").signalUrl).toBe("/en/ghid/signal");
		for (const locale of ["ro", "en"] as const) {
			for (const path of [
				"/",
				PAGES.programmes[locale],
				PAGES.contact[locale],
				PAGES.faq[locale],
			]) {
				const i = hemisyncInvite(locale, path);
				const all = [i.label, ...i.placeholders, i.nudge?.text, i.nudge?.question].join(" ");
				expect(all).not.toMatch(/!|\p{Extended_Pictographic}/u);
			}
		}
	});
});
