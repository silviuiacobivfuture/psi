import {
	SITE_SETTINGS_UNSET,
	type SiteSettings,
	type SiteSettingsClient,
	siteSettingsFromEnv,
	toggleOn,
} from "@psi/cms-client";

/**
 * the Blog's settings from the shared CMS (`site-settings`, the blog group), read with the site's
 * read-only key (CMS_URL, CMS_API_KEY) and kept warm in the background; the CMS's webhook refreshes
 * them at once. THE FALLBACK RULE: no CMS, or a field the owners left unset, means exactly what the
 * site did before the CMS had a say. This site publishes no phone, address or hours; only the
 * Compass's toggles apply.
 */
export const siteSettings: SiteSettingsClient | null = siteSettingsFromEnv(process.env, "blog");

/** What is known now: the CMS's last answer, or every field unset without a CMS. */
export function settingsOf(client: SiteSettingsClient | null): SiteSettings {
	return client === null ? SITE_SETTINGS_UNSET : client.current();
}

const now = (): SiteSettings => settingsOf(siteSettings);

/** The Compass's account group, when accounts are on (today: shown). */
export function accountsSignIn(s: SiteSettings = now()): boolean {
	return toggleOn(s, "accountsSignIn", true);
}

/** The Compass's install and notification tools (today: shown). */
export function installPrompt(s: SiteSettings = now()): boolean {
	return toggleOn(s, "installPrompt", true);
}
