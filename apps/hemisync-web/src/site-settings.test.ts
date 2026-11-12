import { createSiteSettingsClient, SITE_SETTINGS_UNSET, siteSettingsFor } from "@psi/cms-client";
import { describe, expect, it } from "vitest";
import { accountsSignIn, installPrompt, settingsOf } from "./site-settings";

describe("hemisync's site settings: the fallback rule", () => {
	it("no CMS (a null client) keeps today's Compass: account group and install tools shown", () => {
		const s = settingsOf(null);
		expect(s).toEqual(SITE_SETTINGS_UNSET);
		expect([accountsSignIn(s), installPrompt(s)]).toEqual([true, true]);
	});

	it("the CMS's toggles win where set; inherit keeps today's", () => {
		const s = siteSettingsFor(
			{
				hemisync: { accountsSignIn: "off", installPrompt: "inherit" },
				psizone: { installPrompt: "off" },
			},
			"hemisync",
		);
		expect(accountsSignIn(s)).toBe(false);
		expect(installPrompt(s)).toBe(true);
	});

	it("reads them through the client the site runs (its fetch seam)", async () => {
		const client = createSiteSettingsClient({
			cmsUrl: "http://cms.test",
			apiKey: "k",
			site: "hemisync",
			fetch: async () => Response.json({ hemisync: { installPrompt: "off" } }),
		});
		expect(installPrompt(settingsOf(client))).toBe(true);
		await client.refresh();
		expect(installPrompt(settingsOf(client))).toBe(false);
	});
});
