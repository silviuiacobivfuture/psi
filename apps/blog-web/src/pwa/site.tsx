import { isRetired } from "@psi/content";
import { createPwa, TopicSchema } from "@psi/pwa";
import { liveSites } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { account } from "../account";
import { ESTATE, SITE, siteNames } from "../estate";
import { base, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import { installPrompt } from "../site-settings";

/** The notifications page, under the account (Romanian slug in both locales). */
export function notificationsPath(locale: Locale): string {
	return `${base(locale)}/cont/notificari`;
}

/**
 * The blog as an installable app (docs/plans/pwa.md): new articles from each of the three brands,
 * for anyone. The blog also sends them: the CMS's publish webhook lands here (./routes.tsx).
 */
export const pwa = createPwa({
	brand: "blog",
	origin: ESTATE[SITE],
	origins: liveSites().map((s) => ESTATE[s]),
	prefixes: { ro: "", en: "/en" },
	theme: "blog-light",
	messages: m,
	siteNames,
	// Every brand's articles except a retired brand's (RETIRED_SITES).
	topics: TopicSchema.options.filter(
		(t) => t.startsWith("articles:") && !isRetired(t.slice("articles:".length)),
	),
	identity: account,
	notificationsPath,
});

/**
 * The layout's PWA head tags. No path is passed: the blog's own pages say `noindex` themselves
 * (the account frame does), so it is never printed twice.
 */
export function PwaHeadTags({ locale }: { locale: Locale }): JSX.Element {
	return pwa.head(locale);
}

/** The Compass's install and notification entries. */
export function SitePwaTools({ locale }: { locale: Locale }): JSX.Element {
	// None when the owners hid them in the CMS (`installPrompt`).
	return pwa.tools(locale, { install: installPrompt() });
}
