import { Doctype, type JsonLdNode } from "@psi/ui";
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Locale } from "./i18n";
import { PwaHeadTags } from "./pwa/site";
import { SiteHead } from "./seo";
import type { Theme } from "./theme";

const FONTS =
	"https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,100..900,0..100;1,9..144,100..900,0..100&family=Manrope:wght@400..800&family=IBM+Plex+Mono:wght@400;500;600&display=swap";

export interface LayoutProps {
	locale: Locale;
	theme: Theme;
	title: string;
	description: string;
	/** Absolute URL of this page. */
	canonical: string;
	/** The same page in the other locale, when it exists. */
	alternate?: { locale: Locale; href: string };
	/** Absolute URL of this locale's feed. */
	feed: { title: string; href: string };
	/** Pages that must not be indexed yet (articles still in review, the 404). */
	noindex?: boolean;
	ogType?: "website" | "article";
	/** Extra structured data for this page (an article, its FAQ), after the site's own. */
	jsonLd?: ReadonlyArray<JsonLdNode>;
	/** The phrases this page answers, for `<meta name="keywords">`. */
	keywords?: ReadonlyArray<string>;
	children: Child;
}

export function Layout({
	locale,
	theme,
	title,
	description,
	canonical,
	alternate,
	feed,
	noindex = false,
	ogType = "website",
	jsonLd = [],
	keywords = [],
	children,
}: LayoutProps): JSX.Element {
	return (
		<>
			<Doctype />
			<html lang={locale} data-theme={theme}>
				<head>
					<meta charset="utf-8" />
					<meta
						name="viewport"
						content="width=device-width, initial-scale=1, interactive-widget=resizes-content"
					/>
					<title>{title}</title>
					<meta name="description" content={description} />
					<meta name="color-scheme" content="light dark" />
					{keywords.length > 0 ? <meta name="keywords" content={keywords.join(", ")} /> : null}
					{noindex ? <meta name="robots" content="noindex" /> : null}
					<SiteHead
						locale={locale}
						theme={theme}
						title={title}
						description={description}
						canonical={canonical}
						alternate={alternate}
						ogType={ogType}
						extraJsonLd={jsonLd}
					/>
					<PwaHeadTags locale={locale} />
					<link rel="alternate" type="application/rss+xml" title={feed.title} href={feed.href} />
					<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
					<link rel="preconnect" href="https://fonts.googleapis.com" />
					<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
					<link rel="stylesheet" href={FONTS} />
					<link rel="stylesheet" href="/assets/app.css" />
					<script type="module" src="/assets/datastar.js" />
				</head>
				<body class="pz-grain">{children}</body>
			</html>
		</>
	);
}
