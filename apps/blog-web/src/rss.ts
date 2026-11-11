import { blogPaths } from "@psi/content";
import type { BlogBrand } from "./brands";
import { published } from "./content/articles";
import { brandName, topicLabel } from "./content/topics";
import { rfc822 } from "./dates";
import { at, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";
import { routes } from "./routes";

const ENTITIES: Readonly<Record<string, string>> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&apos;",
};

/** Escapes text for XML element content and attribute values. */
export function xml(text: string): string {
	return text.replace(/[&<>"']/g, (ch) => ENTITIES[ch] ?? ch);
}

/**
 * RSS 2.0 for one locale, of one brand or of all three: published articles only (nothing in
 * review and no draft is ever syndicated).
 */
export function rssFeed(locale: Locale, origin: string, brand?: BlogBrand): string {
	const o = at(locale);
	const items = published({ brand }).map((a) => {
		const link = `${origin}${routes.article(locale, a.slug)}`;
		const creator = a.kind === "editorial" ? a.author.team[locale] : a.author.name;
		return [
			"<item>",
			`<title>${xml(a.title[locale])}</title>`,
			`<link>${xml(link)}</link>`,
			`<guid isPermaLink="true">${xml(link)}</guid>`,
			`<description>${xml(a.standfirst[locale])}</description>`,
			`<category>${xml(brandName(a.brand, locale))}</category>`,
			`<category>${xml(topicLabel(a.topic, locale))}</category>`,
			`<dc:creator>${xml(creator)}</dc:creator>`,
			`<pubDate>${rfc822(a.publishedAt)}</pubDate>`,
			"</item>",
		].join("");
	});
	const self = `${origin}${brand === undefined ? routes.rss(locale) : routes.brandRss(locale, brand)}`;
	const title =
		brand === undefined
			? m.rss_title({}, o)
			: m.rss_brand_title({ brand: brandName(brand, locale) }, o);
	const home = brand === undefined ? routes.home(locale) : blogPaths.brand(locale, brand);
	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
		"<channel>",
		`<title>${xml(title)}</title>`,
		`<link>${xml(`${origin}${home}`)}</link>`,
		`<description>${xml(m.rss_description({}, o))}</description>`,
		`<language>${locale}</language>`,
		`<atom:link href="${xml(self)}" rel="self" type="application/rss+xml"/>`,
		...items,
		"</channel>",
		"</rss>",
		"",
	].join("\n");
}
