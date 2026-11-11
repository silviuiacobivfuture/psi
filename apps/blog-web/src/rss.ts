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

/** RSS 2.0 for one locale: published articles only (nothing in review is syndicated). */
export function rssFeed(locale: Locale, origin: string): string {
	const o = at(locale);
	const items = published().map((a) => {
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
	const self = `${origin}${routes.rss(locale)}`;
	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
		"<channel>",
		`<title>${xml(m.rss_title({}, o))}</title>`,
		`<link>${xml(`${origin}${routes.home(locale)}`)}</link>`,
		`<description>${xml(m.rss_description({}, o))}</description>`,
		`<language>${locale}</language>`,
		`<atom:link href="${xml(self)}" rel="self" type="application/rss+xml"/>`,
		...items,
		"</channel>",
		"</rss>",
		"",
	].join("\n");
}
