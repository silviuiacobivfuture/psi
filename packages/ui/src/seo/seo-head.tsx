/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { JsonLd, type JsonLdNode } from "./json-ld";

export interface SeoAlternate {
	/** `ro`, `en` or `x-default`. */
	hreflang: string;
	/** Absolute URL. */
	href: string;
}

export interface SeoHeadProps {
	title: string;
	description: string;
	/** Absolute URL on the site's canonical origin. */
	canonical: string;
	/**
	 * Every language version that exists, this page included. `x-default` is added for the
	 * Romanian one. Leave empty when the page has no translation: no hreflang is then printed.
	 */
	alternates: ReadonlyArray<SeoAlternate>;
	siteName: string;
	/** `og:locale` of this page (`ro_RO`); the others' go into `og:locale:alternate`. */
	ogLocale: string;
	ogLocaleAlternates?: ReadonlyArray<string>;
	type?: "website" | "article";
	/** Absolute URL and alt text; without one the card is a plain summary. */
	image?: { url: string; alt: string };
	/** The current theme's `bg`, from `themeColor`. */
	themeColor?: string;
	jsonLd?: ReadonlyArray<JsonLdNode>;
}

/** `og:locale` for each locale psi publishes in. */
export const OG_LOCALE: Readonly<Record<string, string>> = { ro: "ro_RO", en: "en_GB" };

/**
 * Everything a search engine or a link preview reads from `<head>`, except `<title>` and the
 * description meta, which the layout prints: canonical, hreflang (with `x-default`), Open Graph,
 * Twitter, theme-color and JSON-LD. Ships no text; every value comes from the app.
 */
export function SeoHead({
	title,
	description,
	canonical,
	alternates,
	siteName,
	ogLocale,
	ogLocaleAlternates = [],
	type = "website",
	image,
	themeColor: color,
	jsonLd = [],
}: SeoHeadProps): JSX.Element {
	const xDefault = alternates.find((a) => a.hreflang === "ro");
	return (
		<>
			<link rel="canonical" href={canonical} />
			{alternates.length > 1
				? [
						...alternates.map((a) => <link rel="alternate" hreflang={a.hreflang} href={a.href} />),
						xDefault !== undefined ? (
							<link rel="alternate" hreflang="x-default" href={xDefault.href} />
						) : null,
					]
				: null}
			<meta property="og:type" content={type} />
			<meta property="og:site_name" content={siteName} />
			<meta property="og:title" content={title} />
			<meta property="og:description" content={description} />
			<meta property="og:url" content={canonical} />
			<meta property="og:locale" content={ogLocale} />
			{ogLocaleAlternates.map((l) => (
				<meta property="og:locale:alternate" content={l} />
			))}
			{image !== undefined ? (
				<>
					<meta property="og:image" content={image.url} />
					<meta property="og:image:alt" content={image.alt} />
				</>
			) : null}
			<meta name="twitter:card" content={image !== undefined ? "summary_large_image" : "summary"} />
			<meta name="twitter:title" content={title} />
			<meta name="twitter:description" content={description} />
			{image !== undefined ? <meta name="twitter:image" content={image.url} /> : null}
			{color !== undefined ? <meta name="theme-color" content={color} /> : null}
			{jsonLd.map((data) => (
				<JsonLd data={data} />
			))}
		</>
	);
}
