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

/**
 * Psizone's settings from the shared CMS (`site-settings`, the psizone group), read with the
 * site's read-only key (CMS_URL, CMS_API_KEY) and kept warm in the background; the CMS's webhook
 * refreshes them at once (cms.ts). THE FALLBACK RULE: no CMS, or a field the owners left unset,
 * means exactly what the site published before the CMS had a say. Pages read these accessors at
 * render time and never touch the CMS's shape.
 */
export const siteSettings: SiteSettingsClient | null = siteSettingsFromEnv(process.env, "psizone");

/** The centre's main public number, as published on psizone.ro. */
const TODAY_MAIN: Phone = { tel: "+40748017752", display: "0748 017 752", label: null };

/** The centre's public phone numbers, as published on psizone.ro (the first is the main one). */
export const TODAY_PHONES: ReadonlyArray<Phone> = [
	TODAY_MAIN,
	{ tel: "+40752466792", display: "0752 466 792", label: null },
];

/**
 * The address as the live psizone.ro/contact published it (read 2026-11-11, docs/plans/psizone-web.md
 * §0.5); an open owner question (Al. I. Cuza 72 in the 2024 press).
 */
export const TODAY_ADDRESS: PostalAddress = {
	streetAddress: "Str. General Alexandru Cernat nr. 126",
	addressLocality: "Galați",
	addressCountry: "RO",
};

/** What is known now: the CMS's last answer, or every field unset without a CMS. */
export function settingsOf(client: SiteSettingsClient | null): SiteSettings {
	return client === null ? SITE_SETTINGS_UNSET : client.current();
}

const now = (): SiteSettings => settingsOf(siteSettings);

export function phones(s: SiteSettings = now()): ReadonlyArray<Phone> {
	return orToday(s.phones, TODAY_PHONES);
}

/** The hero's number: the first phone. */
export function mainPhone(s: SiteSettings = now()): Phone {
	const [first] = phones(s);
	return first ?? TODAY_MAIN;
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

/** The hero's years figure: the CMS's, or the number in today's copy. */
export function heroYears(today: number, s: SiteSettings = now()): number {
	return s.heroYears ?? today;
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
