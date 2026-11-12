import { createSiteSettingsClient, SITE_SETTINGS_UNSET, siteSettingsFor } from "@psi/cms-client";
import { describe, expect, it } from "vitest";
import { ContactExtras } from "./pages/contact-extras";
import {
	accountsSignIn,
	installPrompt,
	openingHours,
	phones,
	postalAddress,
	settingsOf,
	socialLinks,
	TODAY_ADDRESS,
} from "./site-settings";

/** The CMS's REST answer for the `site-settings` global, as Payload sends it. */
const RAW = {
	psizone: { heroYears: 23 },
	eqsync: {
		phones: [
			{ tel: "+40 773 819 193", display: "0773 819 193" },
			{ tel: "+40741000111", display: "0741 000 111", labelRo: "Suport", labelEn: "Support" },
		],
		addresses: [{ street: "Str. Domnească nr. 1", city: "Galați", country: "RO" }],
		openingHours: [{ daysRo: "Luni–Vineri", daysEn: "Monday–Friday", hours: "10:00–17:00" }],
		social: [{ network: "instagram", url: "https://www.instagram.com/eqsync" }],
		accountsSignIn: "off",
		installPrompt: "inherit",
	},
};

describe("EQ-SYNC's site settings: the fallback rule", () => {
	it("no CMS (a null client) gives exactly today's values", () => {
		const s = settingsOf(null);
		expect(s).toEqual(SITE_SETTINGS_UNSET);
		expect(phones("ro", s)).toEqual([
			{ tel: "+40773819193", display: "0773 819 193", label: null },
		]);
		expect(postalAddress(s)).toEqual(TODAY_ADDRESS);
		expect(openingHours(s)).toEqual([]);
		expect(socialLinks(s)).toEqual([]);
		expect([accountsSignIn(s), installPrompt(s)]).toEqual([true, true]);
	});

	it("the CMS's values win where they are set; inherited toggles keep today's", () => {
		const s = siteSettingsFor(RAW, "eqsync");
		expect(phones("en", s).map((p) => p.tel)).toEqual(["+40773819193", "+40741000111"]);
		expect(phones("en", s)[1]?.label).toEqual({ ro: "Suport", en: "Support" });
		expect(postalAddress(s).streetAddress).toBe("Str. Domnească nr. 1");
		expect(openingHours(s)[0]?.hours).toBe("10:00–17:00");
		expect(socialLinks(s).map((l) => l.network)).toEqual(["instagram"]);
		expect(accountsSignIn(s)).toBe(false);
		expect(installPrompt(s)).toBe(true);
	});

	it("reads them through the client the site runs (its fetch seam)", async () => {
		const client = createSiteSettingsClient({
			cmsUrl: "http://cms.test",
			apiKey: "k",
			site: "eqsync",
			fetch: async () => Response.json(RAW),
		});
		expect(socialLinks(settingsOf(client))).toEqual([]);
		await client.refresh();
		expect(socialLinks(settingsOf(client))).toHaveLength(1);
	});

	it("the trader card's hours and social rows render nothing until the CMS sets them", async () => {
		expect(String(await ContactExtras({ locale: "ro", hours: [], social: [] }))).toBe("");
		const s = siteSettingsFor(RAW, "eqsync");
		const html = String(
			await ContactExtras({ locale: "ro", hours: openingHours(s), social: socialLinks(s) }),
		);
		expect(html).toContain("Program");
		expect(html).toContain("Luni–Vineri: 10:00–17:00");
		expect(html).toContain("Ne găsiți și pe");
		expect(html).toContain('href="https://www.instagram.com/eqsync"');
	});
});
