import { createSiteSettingsClient, SITE_SETTINGS_UNSET, siteSettingsFor } from "@psi/cms-client";
import { describe, expect, it } from "vitest";
import { ContactExtras } from "./pages/contact-extras";
import {
	accountsSignIn,
	bookingInChat,
	heroYears,
	installPrompt,
	mainPhone,
	openingHours,
	phones,
	postalAddress,
	settingsOf,
	socialLinks,
	TODAY_ADDRESS,
	TODAY_PHONES,
} from "./site-settings";

/** The CMS's REST answer for the `site-settings` global, as Payload sends it. */
const RAW = {
	eqsync: { heroYears: 9 },
	psizone: {
		phones: [
			{
				tel: "+40 741 000 111",
				display: "0741 000 111",
				labelRo: "Recepție",
				labelEn: "Front desk",
			},
		],
		addresses: [{ street: "Str. Domnească nr. 1", city: "Galați", country: "RO" }],
		openingHours: [{ daysRo: "Luni–Vineri", daysEn: "Monday–Friday", hours: "09:00–18:00" }],
		social: [{ network: "facebook", url: "https://www.facebook.com/psizone" }],
		heroYears: 23,
		bookingInChat: "off",
		accountsSignIn: "inherit",
		installPrompt: "off",
	},
};

describe("Psizone's site settings: the fallback rule", () => {
	it("no CMS (a null client) gives exactly today's values", () => {
		const s = settingsOf(null);
		expect(s).toEqual(SITE_SETTINGS_UNSET);
		expect(phones(s)).toEqual(TODAY_PHONES);
		expect(mainPhone(s)).toEqual({ tel: "+40748017752", display: "0748 017 752", label: null });
		expect(postalAddress(s)).toEqual(TODAY_ADDRESS);
		expect(openingHours(s)).toEqual([]);
		expect(socialLinks(s)).toEqual([]);
		expect(heroYears(22, s)).toBe(22);
		expect([bookingInChat(s), accountsSignIn(s), installPrompt(s)]).toEqual([true, true, true]);
	});

	it("the CMS's values win where they are set; inherited toggles keep today's", () => {
		const s = siteSettingsFor(RAW, "psizone");
		expect(phones(s)).toEqual([
			{ tel: "+40741000111", display: "0741 000 111", label: { ro: "Recepție", en: "Front desk" } },
		]);
		expect(mainPhone(s).tel).toBe("+40741000111");
		expect(postalAddress(s)).toEqual({
			streetAddress: "Str. Domnească nr. 1",
			addressLocality: "Galați",
			addressCountry: "RO",
		});
		expect(openingHours(s)).toHaveLength(1);
		expect(socialLinks(s).map((l) => l.url)).toEqual(["https://www.facebook.com/psizone"]);
		expect(heroYears(22, s)).toBe(23);
		expect(bookingInChat(s)).toBe(false);
		expect(accountsSignIn(s)).toBe(true);
		expect(installPrompt(s)).toBe(false);
	});

	it("reads them through the client the site runs (its fetch seam), without waiting on pages", async () => {
		const client = createSiteSettingsClient({
			cmsUrl: "http://cms.test",
			apiKey: "k",
			site: "psizone",
			fetch: async () => Response.json(RAW),
		});
		expect(phones(settingsOf(client))).toEqual(TODAY_PHONES);
		await client.refresh();
		expect(heroYears(22, settingsOf(client))).toBe(23);
	});

	it("the contact page's hours and social list render nothing until the CMS sets them", async () => {
		expect(String(await ContactExtras({ locale: "ro", hours: [], social: [] }))).toBe("");
		const s = siteSettingsFor(RAW, "psizone");
		const html = String(
			await ContactExtras({ locale: "en", hours: openingHours(s), social: socialLinks(s) }),
		);
		expect(html).toContain("Opening hours");
		expect(html).toContain("Monday–Friday");
		expect(html).toContain('href="https://www.facebook.com/psizone"');
		expect(html).toContain("Facebook");
	});
});
