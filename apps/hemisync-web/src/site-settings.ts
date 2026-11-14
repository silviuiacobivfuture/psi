import {
	orToday,
	type Phone,
	SITE_SETTINGS_UNSET,
	type SiteSettings,
	type SiteSettingsClient,
	siteSettingsFromEnv,
	toggleOn,
} from "@psi/cms-client";

/**
 * Hemi-Sync România's settings from the shared CMS (`site-settings`, the hemisync group), read with the site's
 * read-only key (CMS_URL, CMS_API_KEY) and kept warm in the background; the CMS's webhook refreshes
 * them at once. THE FALLBACK RULE: no CMS, or a field the owners left unset, means exactly what the
 * site did before the CMS had a say. This site publishes no phone, address or hours; only the
 * Compass's toggles and the booking's phones (when the owners publish some) apply.
 */
export const siteSettings: SiteSettingsClient | null = siteSettingsFromEnv(process.env, "hemisync");

/** What is known now: the CMS's last answer, or every field unset without a CMS. */
export function settingsOf(client: SiteSettingsClient | null): SiteSettings {
	return client === null ? SITE_SETTINGS_UNSET : client.current();
}

const now = (): SiteSettings => settingsOf(siteSettings);

/**
 * Hemi-Sync's public phone numbers: only what the owners published in the CMS. The site publishes
 * none today and never borrows another site's, so an unset list is empty and the booking's failure
 * page shows no numbers.
 */
export function phones(s: SiteSettings = now()): ReadonlyArray<Phone> {
	return orToday(s.phones, []);
}

/** The guide offers free times inside the conversation (today: yes). */
export function bookingInChat(s: SiteSettings = now()): boolean {
	return toggleOn(s, "bookingInChat", true);
}

/** The Compass's account group, when accounts are on (today: shown). */
export function accountsSignIn(s: SiteSettings = now()): boolean {
	return toggleOn(s, "accountsSignIn", true);
}

/** The Compass's install and notification tools (today: shown). */
export function installPrompt(s: SiteSettings = now()): boolean {
	return toggleOn(s, "installPrompt", true);
}
