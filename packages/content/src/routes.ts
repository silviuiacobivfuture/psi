import type { Brand } from "./brands";
import type { Locale } from "./locale";
import { ORIGINS } from "./origins";

/**
 * The blog's public paths, the one place their shape is written. blog-web routes by them and
 * every other site links to them, so a card on a brand site and the blog never disagree.
 */
export const blogPaths = {
	home: (locale: Locale): string => (locale === "ro" ? "/" : "/en"),
	article: (locale: Locale, slug: string): string =>
		locale === "ro" ? `/articole/${slug}` : `/en/articles/${slug}`,
	/** The index narrowed to one brand, scrolled to the list. */
	brand: (locale: Locale, brand: Brand): string =>
		`${locale === "ro" ? "/" : "/en"}?brand=${brand}#articole`,
	/** One RSS feed per brand and locale. */
	brandFeed: (locale: Locale, brand: Brand): string =>
		`${locale === "ro" ? "" : "/en"}/rss/${brand}.xml`,
} as const;

/** The canonical, absolute URL of an article on the blog. */
export function articleUrl(locale: Locale, slug: string, blog: string = ORIGINS.blog): string {
	return `${blog}${blogPaths.article(locale, slug)}`;
}

/** The blog's listing of one brand's articles, absolute. */
export function brandListingUrl(locale: Locale, brand: Brand, blog: string = ORIGINS.blog): string {
	return `${blog}${blogPaths.brand(locale, brand)}`;
}
