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
import { phones, postalAddress, socialLinks } from "./site-settings";
import type { Theme } from "./theme";

const ORIGIN = ESTATE[SITE];

/**
 * The trader as the live eq-sync.ro publishes it (docs/plans/eqsync-web.md, "Trader"), with the
 * phones, address and social profiles the owners set in the CMS (site-settings.ts; unset = these).
 * No parent relation to Psizone is printed: EQSYNC SRL is its own legal entity.
 */
function organization(locale: Locale): JsonLdNode {
	const facts: OrganizationFacts = {
		type: "Organization",
		name: "EQ-SYNC",
		legalName: "EQSYNC SRL",
		url: `${ORIGIN}/`,
		telephones: phones(locale).map((p) => p.tel),
		address: postalAddress(),
		taxID: "55664251",
	};
	// `organizationJsonLd` has no social field yet; schema.org's is `sameAs`, printed only when set.
	const sameAs = socialLinks().map((s) => s.url);
	const org = organizationJsonLd(facts);
	return sameAs.length === 0 ? org : { ...org, sameAs };
}

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
	const jsonLd: JsonLdNode[] = page.isHome
		? [webSiteJsonLd({ name, url: `${ORIGIN}/`, inLanguage: ["ro", "en"] }), organization(locale)]
		: [
				breadcrumbJsonLd([
					{ name, url: page.home },
					{ name: pageName(title, name), url: page.canonical },
				]),
			];
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
