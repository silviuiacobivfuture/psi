import {
	breadcrumbJsonLd,
	type JsonLdNode,
	OG_LOCALE,
	pageName,
	pagePaths,
	SeoHead,
	servedEntries,
	sitemapXml,
	themeColor,
	webSiteJsonLd,
} from "@psi/ui";
import type { Hono } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import { published } from "./content/articles";
import { ESTATE, SITE, siteNames } from "./estate";
import type { Locale } from "./i18n";
import { routes } from "./routes";
import type { Theme } from "./theme";

const ORIGIN = ESTATE[SITE];

/** A URL the page built from the request, re-rooted on the blog's canonical origin. */
function canonicalOf(href: string): string {
	return `${ORIGIN}${new URL(href).pathname}`;
}

/** canonical, hreflang, Open Graph, Twitter, theme-color and JSON-LD for one page. */
export function SiteHead({
	locale,
	theme,
	title,
	description,
	canonical,
	alternate,
	ogType,
}: {
	locale: Locale;
	theme: Theme;
	title: string;
	description: string;
	canonical: string;
	alternate?: { locale: Locale; href: string };
	ogType: "website" | "article";
}): JSX.Element {
	const self = canonicalOf(canonical);
	const name = siteNames(locale)[SITE];
	const home = `${ORIGIN}${routes.home(locale)}`;
	const alternates = [
		{ hreflang: locale, href: self },
		...(alternate !== undefined
			? [{ hreflang: alternate.locale, href: canonicalOf(alternate.href) }]
			: []),
	].sort((a, b) => (a.hreflang === "ro" ? -1 : b.hreflang === "ro" ? 1 : 0));
	const jsonLd: JsonLdNode[] =
		self === home
			? [webSiteJsonLd({ name, url: `${ORIGIN}/`, inLanguage: ["ro", "en"] })]
			: [
					breadcrumbJsonLd([
						{ name, url: home },
						{ name: pageName(title, name), url: self },
					]),
				];
	return (
		<SeoHead
			title={title}
			description={description}
			canonical={self}
			alternates={alternates}
			siteName={name}
			ogLocale={OG_LOCALE[locale] ?? locale}
			ogLocaleAlternates={
				alternate !== undefined ? [OG_LOCALE[alternate.locale] ?? alternate.locale] : []
			}
			type={ogType}
			themeColor={themeColor(theme)}
			jsonLd={jsonLd}
		/>
	);
}

/**
 * `/sitemap.xml`: the static pages and every published article, in both languages, as each
 * page's own head describes it. Drafts and articles in review carry noindex and drop out.
 */
export async function sitemap(app: Hono): Promise<string> {
	const articles = published();
	const paths = [
		...pagePaths(app),
		...articles.flatMap((a) => [routes.article("ro", a.slug), routes.article("en", a.slug)]),
	];
	const lastmod = new Map(
		articles.flatMap((a) => {
			const day = /^\d{4}-\d{2}-\d{2}/.exec(a.publishedAt)?.[0];
			return day === undefined
				? []
				: [
						[`${ORIGIN}${routes.article("ro", a.slug)}`, day],
						[`${ORIGIN}${routes.article("en", a.slug)}`, day],
					];
		}),
	);
	const entries = await servedEntries(app, paths);
	return sitemapXml(entries.map((e) => ({ ...e, lastmod: lastmod.get(e.loc) })));
}
