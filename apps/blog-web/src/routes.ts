import { base, type Locale } from "./i18n";

/** The blog's own route table, keyed by locale (Romanian at the root, English under /en). */
export const routes = {
	home: (locale: Locale): string => base(locale) || "/",
	article: (locale: Locale, slug: string): string =>
		locale === "ro" ? `/articole/${slug}` : `/en/articles/${slug}`,
	rss: (locale: Locale): string => `${base(locale)}/rss.xml`,
	guide: (locale: Locale): string => `${base(locale)}/ghid`,
} as const;
