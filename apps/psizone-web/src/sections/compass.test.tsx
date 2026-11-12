import { compassDestinations } from "@psi/ui/testing";
import { describe, expect, it } from "vitest";
import { Header } from "./header";

/** Chat, not navigation: none of these may ever list a destination (Enter asks the guide anyway). */
const CHAT = ["ce zici", "salut", "cat costa", "Ce zici?", "bună ziua", "cât costă?"];

describe("the compass's destinations", () => {
	for (const locale of ["ro", "en"] as const) {
		const html = String(<Header locale={locale} otherHref="/" theme="psizone-dark" />);

		it(`lists every destination for an empty field (${locale})`, () => {
			expect(compassDestinations(html, "").length).toBeGreaterThan(3);
		});

		it(`never lists a destination for small talk (${locale})`, () => {
			for (const q of CHAT) expect(compassDestinations(html, q), q).toEqual([]);
		});
	}
});
