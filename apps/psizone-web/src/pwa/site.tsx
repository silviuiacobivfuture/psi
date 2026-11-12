import { createPwa } from "@psi/pwa";
import { liveSites, requestPath } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { account } from "../account";
import { ESTATE, SITE, siteNames } from "../estate";
import { base, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import { installPrompt } from "../site-settings";

/** The notifications page, under the account (Romanian slug in both locales, like every Psizone page). */
export function notificationsPath(locale: Locale): string {
	return `${base(locale)}/cont/notificari`;
}

/**
 * Psizone as an installable app (docs/plans/pwa.md): booking updates for signed-in people,
 * Psizone's new articles for anyone. Every word is Psizone's own (messages/pwa/{locale}.json).
 */
export const pwa = createPwa({
	brand: "psizone",
	origin: ESTATE[SITE],
	origins: liveSites().map((s) => ESTATE[s]),
	prefixes: { ro: "", en: "/en" },
	theme: "psizone-light",
	messages: m,
	siteNames,
	topics: ["booking", "articles:psizone"],
	identity: account,
	notificationsPath,
});

/** The layout's PWA head tags for the page being rendered. */
export function PwaHeadTags({ locale }: { locale: Locale }): JSX.Element {
	return pwa.head(locale, requestPath());
}

/** The Compass's install and notification entries; the install invitation hidden when the owners turned it off (`installPrompt`). */
export function SitePwaTools({ locale }: { locale: Locale }): JSX.Element {
	return pwa.tools(locale, { install: installPrompt() });
}
