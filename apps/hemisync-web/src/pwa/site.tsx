import { readNovuPush, syncClientDevices } from "@psi/notify/push";
import { createPwa, type Pwa } from "@psi/pwa";
import { accountHashOf } from "@psi/scheduling";
import { liveSites, requestPath } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { account } from "../account";
import { ESTATE, SITE, siteNames } from "../estate";
import { base, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import { installPrompt } from "../site-settings";

/** The notifications page, under the account. */
export function notificationsPath(locale: Locale): string {
	return `${base(locale)}/cont/notificari`;
}

/**
 * The estate's Novu, when this site has its settings: a signed-in client's booking devices are kept under their
 * account's client subscriber, and Novu's pushes to them arrive at `/__pwa/novu` (registerPwa).
 */
export const novu = readNovuPush(process.env);

/**
 * Hemi-Sync as an installable app (docs/plans/pwa.md): Hemi-Sync's new articles for anyone, and booking updates
 * (confirmed, moved, cancelled) for a signed-in client. Every word is Hemi-Sync's own (messages/pwa/).
 */
export const pwa: Pwa = createPwa({
	brand: "hemisync",
	origin: ESTATE[SITE],
	origins: liveSites().map((s) => ESTATE[s]),
	prefixes: { ro: "", en: "/en" },
	theme: "hemisync-light",
	messages: m,
	siteNames,
	topics: ["booking", "articles:hemisync"],
	identity: account,
	notificationsPath,
	...(novu === null
		? {}
		: {
				onDevicesChanged: (subject: string) =>
					syncClientDevices(novu, pwa, "hemisync", "hemisync", accountHashOf)(subject),
			}),
});

/** The layout's PWA head tags for the page being rendered. */
export function PwaHeadTags({ locale }: { locale: Locale }): JSX.Element {
	return pwa.head(locale, requestPath());
}

/** The Compass's install and notification entries. */
export function SitePwaTools({ locale }: { locale: Locale }): JSX.Element {
	// None when the owners hid them in the CMS (`installPrompt`).
	return pwa.tools(locale, { install: installPrompt() });
}
