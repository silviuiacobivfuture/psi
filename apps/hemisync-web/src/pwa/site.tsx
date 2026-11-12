import { createPwa } from "@psi/pwa";
import { ESTATE_SITES, requestPath } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { account } from "../account";
import { ESTATE, SITE, siteNames } from "../estate";
import { base, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";

/** The notifications page, under the account. */
export function notificationsPath(locale: Locale): string {
	return `${base(locale)}/cont/notificari`;
}

/**
 * Hemi-Sync as an installable app (docs/plans/pwa.md): Hemi-Sync's new articles for anyone. Bookings
 * join when this site takes them (scheduling S9). Every word is Hemi-Sync's own (messages/pwa/).
 */
export const pwa = createPwa({
	brand: "hemisync",
	origin: ESTATE[SITE],
	origins: ESTATE_SITES.map((s) => ESTATE[s]),
	prefixes: { ro: "", en: "/en" },
	theme: "hemisync-light",
	messages: m,
	siteNames,
	topics: ["articles:hemisync"],
	identity: account,
	notificationsPath,
});

/** The layout's PWA head tags for the page being rendered. */
export function PwaHeadTags({ locale }: { locale: Locale }): JSX.Element {
	return pwa.head(locale, requestPath());
}

/** The Compass's install and notification entries. */
export function SitePwaTools({ locale }: { locale: Locale }): JSX.Element {
	return pwa.tools(locale);
}
