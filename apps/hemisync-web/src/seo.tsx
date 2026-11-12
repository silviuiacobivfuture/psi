import {
	breadcrumbJsonLd,
	type JsonLdNode,
	localisedPage,
	OG_LOCALE,
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

/** canonical, hreflang, Open Graph, Twitter, theme-color and JSON-LD for one page. */
export function SiteHead({
	locale,
	theme,
	title,
	description,
	alternate,
	extraJsonLd = [],
}: {
	locale: Locale;
	theme: Theme;
	title: string;
	description: string;
	alternate: { locale: Locale; href: string };
	/** Page-specific structured data (FAQPage, Event), printed after the breadcrumbs. */
	extraJsonLd?: ReadonlyArray<JsonLdNode>;
}): JSX.Element {
	const page = localisedPage(ORIGIN, locale, alternate);
	const name = siteNames(locale)[SITE];
	// Name and URL only: the operator (legal name, address, phone) is an open owner question
	// (docs/plans/hemisync-web.md, question 1), and no relation to Psizone is printed.
	const jsonLd: JsonLdNode[] = page.isHome
		? [
				webSiteJsonLd({ name, url: `${ORIGIN}/`, inLanguage: ["ro", "en"] }),
				organizationJsonLd({ type: "Organization", name, url: `${ORIGIN}/` }),
			]
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
			jsonLd={[...jsonLd, ...extraJsonLd]}
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

/** The facts of one past or future event; nothing here is ever guessed (no price, no organiser). */
export interface EventFacts {
	name: string;
	description: string;
	/** ISO dates (`2023-04-01`). */
	startDate: string;
	endDate: string;
	/** In person: the city; online: undefined. */
	city?: string;
	/** Absolute URL of the page that describes the event. */
	url: string;
	inLanguage: string;
	online: boolean;
}

/** schema.org `Event` for a workshop edition: dates, place or online, language, no offers. */
export function eventJsonLd(f: EventFacts): JsonLdNode {
	return {
		"@context": "https://schema.org",
		"@type": "Event",
		name: f.name,
		description: f.description,
		startDate: f.startDate,
		endDate: f.endDate,
		url: f.url,
		inLanguage: f.inLanguage,
		eventStatus: "https://schema.org/EventScheduled",
		eventAttendanceMode: f.online
			? "https://schema.org/OnlineEventAttendanceMode"
			: "https://schema.org/OfflineEventAttendanceMode",
		location: f.online
			? { "@type": "VirtualLocation", url: f.url }
			: {
					"@type": "Place",
					name: f.city ?? "",
					address: {
						"@type": "PostalAddress",
						addressLocality: f.city ?? "",
						addressCountry: "RO",
					},
				},
	};
}
