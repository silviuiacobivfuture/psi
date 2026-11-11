import { blogPaths } from "@psi/content";
import type { BlogBrand } from "./brands";
import { base, type Locale } from "./i18n";

/**
 * The blog's own route table, keyed by locale (Romanian at the root, English under /en). The
 * public article and feed paths come from `@psi/content`, so the brand sites link to the same.
 */
export const routes = {
	home: (locale: Locale): string => base(locale) || "/",
	article: (locale: Locale, slug: string): string => blogPaths.article(locale, slug),
	rss: (locale: Locale): string => `${base(locale)}/rss.xml`,
	brandRss: (locale: Locale, brand: BlogBrand): string => blogPaths.brandFeed(locale, brand),
	guide: (locale: Locale): string => `${base(locale)}/ghid`,
} as const;
