import {
	type OpeningHours,
	orToday,
	type Phone,
	SITE_SETTINGS_UNSET,
	type SiteSettings,
	type SiteSettingsClient,
	type SocialLink,
	siteSettingsFromEnv,
	toggleOn,
} from "@psi/cms-client";
import type { PostalAddress } from "@psi/ui";
import { at, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";

/**
 * EQ-SYNC's settings from the shared CMS (`site-settings`, the eqsync group), read with the site's
 * read-only key (CMS_URL, CMS_API_KEY) and kept warm in the background; the CMS's webhook refreshes
 * them at once (cms.ts). THE FALLBACK RULE: no CMS, or a field the owners left unset, means exactly
 * what the site published before the CMS had a say. Pages read these accessors at render time and
 * never touch the CMS's shape.
 */
export const siteSettings: SiteSettingsClient | null = siteSettingsFromEnv(process.env, "eqsync");

/** The trader's phone, as eq-sync.ro publishes it (the display is in the site's messages). */
export const TODAY_TEL = "+40773819193";

/** The trader's registered address (docs/plans/eqsync-web.md, "Trader"). */
export const TODAY_ADDRESS: PostalAddress = {
	streetAddress: "Str. Gheorghe Doja nr. 6, bl. 3A, sc. 2, et. 2, ap. 29",
	addressLocality: "Galați",
	addressCountry: "RO",
};

/** What is known now: the CMS's last answer, or every field unset without a CMS. */
export function settingsOf(client: SiteSettingsClient | null): SiteSettings {
	return client === null ? SITE_SETTINGS_UNSET : client.current();
}

const now = (): SiteSettings => settingsOf(siteSettings);

/** The phones to publish: the CMS's, or today's one number. */
export function phones(locale: Locale, s: SiteSettings = now()): ReadonlyArray<Phone> {
	return orToday(s.phones, [{ tel: TODAY_TEL, display: m.cp_phone({}, at(locale)), label: null }]);
}

/** The Organization's address: the first one the CMS lists, or today's. */
export function postalAddress(s: SiteSettings = now()): PostalAddress {
	const [first] = s.addresses ?? [];
	return first === undefined
		? TODAY_ADDRESS
		: { streetAddress: first.street, addressLocality: first.city, addressCountry: first.country };
}

/** Opening hours: none published today, so unset shows nothing. */
export function openingHours(s: SiteSettings = now()): ReadonlyArray<OpeningHours> {
	return s.openingHours ?? [];
}

/** Social profiles: none published today, so unset shows nothing (and no `sameAs`). */
export function socialLinks(s: SiteSettings = now()): ReadonlyArray<SocialLink> {
	return s.social ?? [];
}

/** The Compass's account group, when accounts are on (today: shown). */
export function accountsSignIn(s: SiteSettings = now()): boolean {
	return toggleOn(s, "accountsSignIn", true);
}

/** The Compass's install and notification tools (today: shown). */
export function installPrompt(s: SiteSettings = now()): boolean {
	return toggleOn(s, "installPrompt", true);
}
