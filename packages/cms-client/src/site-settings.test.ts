import { describe, expect, it } from "vitest";
import {
	createSiteSettingsClient,
	orToday,
	SITE_SETTINGS_UNSET,
	siteSettingsFor,
	siteSettingsFromEnv,
	toggleOn,
} from "./site-settings";

const TODAY = [{ tel: "+40748017752", display: "0748 017 752", label: null }];

describe("site settings: the fallback rule", () => {
	it("no CMS configured means no client: the site keeps today's values", () => {
		expect(siteSettingsFromEnv({}, "psizone")).toBeNull();
	});
	it("an empty or unreadable global changes nothing, toggles included", () => {
		for (const raw of [null, {}, { psizone: null }, { psizone: { bookingInChat: "maybe" } }, "x"]) {
			const s = siteSettingsFor(raw, "psizone");
			expect(s).toEqual(SITE_SETTINGS_UNSET);
			expect(toggleOn(s, "bookingInChat", true)).toBe(true);
			expect(toggleOn(s, "installPrompt", false)).toBe(false);
			expect(orToday(s.phones, TODAY)).toEqual(TODAY);
		}
	});
	it("reads one brand's group only, dropping rows that do not parse", () => {
		const s = siteSettingsFor(
			{
				eqsync: { heroYears: 9 },
				psizone: {
					heroYears: 23,
					phones: [{ tel: "+40 748 017 752", display: "0748 017 752" }, { tel: "not a phone" }],
					social: [
						{ network: "instagram", url: "https://instagram.com/psizone" },
						{ network: "myspace", url: "https://x.ro" },
					],
					openingHours: [{ daysRo: "Luni–Vineri", daysEn: "Monday–Friday", hours: "09:00–18:00" }],
					installPrompt: "off",
				},
			},
			"psizone",
		);
		expect(s.heroYears).toBe(23);
		expect(s.phones).toEqual([{ tel: "+40748017752", display: "0748 017 752", label: null }]);
		expect(s.social).toEqual([{ network: "instagram", url: "https://instagram.com/psizone" }]);
		expect(s.openingHours?.[0]?.days.en).toBe("Monday–Friday");
		expect(toggleOn(s, "installPrompt", true)).toBe(false);
		expect(toggleOn(s, "accountsSignIn", true)).toBe(true);
	});
	it("keeps the last known settings when the CMS goes away", async () => {
		let up = true;
		let t = 0;
		const client = createSiteSettingsClient({
			cmsUrl: "http://cms.test",
			apiKey: "k",
			site: "psizone",
			now: () => t,
			fetch: async () =>
				up ? Response.json({ psizone: { heroYears: 30 } }) : new Response(null, { status: 502 }),
		});
		expect(client.current().heroYears).toBeNull();
		expect((await client.refresh()).heroYears).toBe(30);
		up = false;
		t = 120_000;
		expect((await client.refresh()).heroYears).toBe(30);
	});
});
