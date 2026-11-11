import {
	breadcrumbJsonLd,
	type JsonLdNode,
	localisedPage,
	OG_LOCALE,
	type OrganizationFacts,
	organizationJsonLd,
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
import { ESTATE, SITE, siteNames } from "./estate";
import type { Locale } from "./i18n";
import type { Theme } from "./theme";

const ORIGIN = ESTATE[SITE];

/**
 * Psizone's public facts, exactly as the live psizone.ro/contact published them (read 2026-11-11,
 * docs/plans/psizone-web.md §0.5). The address is an open owner question (Gen. Alexandru Cernat 126
 * on the live site, Al. I. Cuza 72 in the 2024 press); no postal code, hours or legal name exist yet.
 */
const PSIZONE: OrganizationFacts = {
	type: "MedicalClinic",
	name: "Psizone",
	url: `${ORIGIN}/`,
	telephones: ["+40748017752", "+40752466792"],
	address: {
		streetAddress: "Str. General Alexandru Cernat nr. 126",
		addressLocality: "Galați",
		addressCountry: "RO",
	},
	taxID: "39469941",
};

/** canonical, hreflang, Open Graph, Twitter, theme-color and JSON-LD for one page. */
export function SiteHead({
	locale,
	theme,
	title,
	description,
	alternate,
}: {
	locale: Locale;
	theme: Theme;
	title: string;
	description: string;
	alternate: { locale: Locale; href: string };
}): JSX.Element {
	const page = localisedPage(ORIGIN, locale, alternate);
	const name = siteNames(locale)[SITE];
	const org = organizationJsonLd(PSIZONE);
	const crumbs = breadcrumbJsonLd([
		{ name, url: page.home },
		{ name: pageName(title, name), url: page.canonical },
	]);
	const jsonLd: JsonLdNode[] = page.isHome
		? [webSiteJsonLd({ name, url: `${ORIGIN}/`, inLanguage: ["ro", "en"] }), org]
		: page.path.endsWith("/contact")
			? [org, crumbs]
			: [crumbs];
	return (
		<SeoHead
			title={title}
			description={description}
			canonical={page.canonical}
			alternates={page.alternates}
			siteName={name}
			ogLocale={OG_LOCALE[locale] ?? locale}
			ogLocaleAlternates={[OG_LOCALE[alternate.locale] ?? alternate.locale]}
			themeColor={themeColor(theme)}
			jsonLd={jsonLd}
		/>
	);
}

/**
 * `/sitemap.xml`: every page the app serves, in both languages, as each page's own head
 * describes it (canonical + hreflang, so translated slugs pair exactly); redirects, 404s and
 * noindex pages are left out.
 */
export async function sitemap(app: Hono): Promise<string> {
	return sitemapXml(await servedEntries(app, pagePaths(app)));
}
