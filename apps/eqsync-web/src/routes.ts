import type { Locale } from "./i18n";

/** Every page beyond the home. */
export const PAGE_IDS = [
	"method",
	"protocols",
	"faq",
	"about",
	"safety",
	"contact",
	"signup",
	"terms",
	"privacy",
	"withdrawal",
] as const;
export type PageId = (typeof PAGE_IDS)[number];

/**
 * The route table (docs/plans/eqsync-web.md §1): Romanian paths are canonical at the root,
 * English lives under /en with English slugs. The sitemap and hreflang read from here.
 */
export const PAGES: Readonly<Record<PageId, Readonly<Record<Locale, string>>>> = {
	method: { ro: "/metoda", en: "/en/method" },
	protocols: { ro: "/protocoale", en: "/en/protocols" },
	faq: { ro: "/intrebari", en: "/en/faq" },
	about: { ro: "/despre", en: "/en/about" },
	safety: { ro: "/disclaimer", en: "/en/legal/disclaimer" },
	contact: { ro: "/contact", en: "/en/contact" },
	signup: { ro: "/inregistrare", en: "/en/sign-up" },
	terms: { ro: "/termeni", en: "/en/legal/terms" },
	privacy: { ro: "/confidentialitate", en: "/en/legal/privacy" },
	withdrawal: { ro: "/retragere", en: "/en/legal/withdrawal" },
};

/** A page's path in one locale, with an optional in-page anchor. */
export function href(locale: Locale, id: PageId, anchor?: string): string {
	const path = PAGES[id][locale];
	return anchor === undefined ? path : `${path}#${anchor}`;
}

/**
 * English paths that earlier markup (the footer, the closing call to action) links to with the
 * Romanian slug under /en. Each answers with a 301 to the page's English path, so nothing 404s.
 */
export const ALIASES: ReadonlyArray<readonly [string, PageId]> = [
	["/en/protocoale", "protocols"],
	["/en/inregistrare", "signup"],
	["/en/termeni", "terms"],
	["/en/confidentialitate", "privacy"],
	["/en/retragere", "withdrawal"],
	["/en/intrebari", "faq"],
	["/en/metoda", "method"],
	["/en/despre", "about"],
];
