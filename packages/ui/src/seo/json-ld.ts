import { raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";

/**
 * Typed schema.org builders. They take facts and print them; they never supply one. A property
 * whose fact is unknown is left out rather than guessed (see `docs/brands/linking.md`).
 */

export type JsonValue =
	| string
	| number
	| boolean
	| null
	| ReadonlyArray<JsonValue>
	| { readonly [key: string]: JsonValue };

export interface JsonLdNode {
	readonly "@context": "https://schema.org";
	readonly "@type": string;
	readonly [key: string]: JsonValue;
}

export interface PostalAddress {
	streetAddress: string;
	addressLocality: string;
	addressCountry: string;
	postalCode?: string;
	addressRegion?: string;
}

export interface OrganizationFacts {
	/** `MedicalClinic` and `LocalBusiness` are both organizations with a place. */
	type: "Organization" | "LocalBusiness" | "MedicalClinic";
	name: string;
	url: string;
	legalName?: string;
	/** E.164 numbers, as published by the organization. */
	telephones?: ReadonlyArray<string>;
	address?: PostalAddress;
	taxID?: string;
}

const CONTEXT = "https://schema.org" as const;

export function organizationJsonLd(facts: OrganizationFacts): JsonLdNode {
	const phones = facts.telephones ?? [];
	const [first] = phones;
	return {
		"@context": CONTEXT,
		"@type": facts.type,
		name: facts.name,
		url: facts.url,
		...(facts.legalName !== undefined ? { legalName: facts.legalName } : {}),
		// One number as a value, several as a list: no contact type is known, so none is printed.
		...(phones.length > 1
			? { telephone: phones }
			: first !== undefined
				? { telephone: first }
				: {}),
		...(facts.address !== undefined
			? { address: { "@type": "PostalAddress", ...facts.address } }
			: {}),
		...(facts.taxID !== undefined ? { taxID: facts.taxID } : {}),
	};
}

export function webSiteJsonLd(site: {
	name: string;
	url: string;
	inLanguage: ReadonlyArray<string>;
}): JsonLdNode {
	return {
		"@context": CONTEXT,
		"@type": "WebSite",
		name: site.name,
		url: site.url,
		inLanguage: site.inLanguage,
	};
}

export interface Crumb {
	name: string;
	/** Absolute URL. */
	url: string;
}

export function breadcrumbJsonLd(crumbs: ReadonlyArray<Crumb>): JsonLdNode {
	return {
		"@context": CONTEXT,
		"@type": "BreadcrumbList",
		itemListElement: crumbs.map((crumb, i) => ({
			"@type": "ListItem",
			position: i + 1,
			name: crumb.name,
			item: crumb.url,
		})),
	};
}

/**
 * One `<script type="application/ld+json">`. Printed raw, so JSX does not entity-escape the
 * JSON; `<` is escaped as `<` so no value can close the script element.
 */
export function JsonLd({ data }: { data: JsonLdNode }): HtmlEscapedString {
	const json = JSON.stringify(data).replace(/</g, "\\u003c");
	return raw(`<script type="application/ld+json">${json}</script>`);
}

/** Questions and their answers as shown on the page (FAQPage rich results). Plain text answers. */
export function faqPageJsonLd(
	items: ReadonlyArray<{ question: string; answer: string }>,
): JsonLdNode {
	return {
		"@context": CONTEXT,
		"@type": "FAQPage",
		mainEntity: items.map((i) => ({
			"@type": "Question",
			name: i.question,
			acceptedAnswer: { "@type": "Answer", text: i.answer },
		})),
	};
}

export interface ArticleFacts {
	/** `MedicalWebPage` for health content, `BlogPosting` otherwise. */
	type: "BlogPosting" | "Article" | "MedicalWebPage";
	headline: string;
	description: string;
	/** Absolute URL of the page. */
	url: string;
	inLanguage: string;
	/** ISO date. */
	datePublished: string;
	dateModified?: string;
	keywords?: ReadonlyArray<string>;
	image?: string;
	/** The publisher (the site). */
	publisher: { name: string; url: string };
	author?: { name: string; type: "Person" | "Organization" };
	/** A clinician's review, when there is one (MedicalWebPage). */
	reviewedBy?: { name: string; reviewedAt: string };
	/** What the page is about, e.g. a topic label. */
	about?: string;
}

/** One article: only the facts given are printed. */
export function articleJsonLd(f: ArticleFacts): JsonLdNode {
	return {
		"@context": CONTEXT,
		"@type": f.type,
		headline: f.headline,
		...(f.type === "MedicalWebPage" ? { name: f.headline } : {}),
		description: f.description,
		url: f.url,
		mainEntityOfPage: f.url,
		inLanguage: f.inLanguage,
		datePublished: f.datePublished,
		...(f.dateModified !== undefined ? { dateModified: f.dateModified } : {}),
		...(f.keywords !== undefined && f.keywords.length > 0
			? { keywords: f.keywords.join(", ") }
			: {}),
		...(f.image !== undefined ? { image: f.image } : {}),
		publisher: { "@type": "Organization", name: f.publisher.name, url: f.publisher.url },
		...(f.author !== undefined ? { author: { "@type": f.author.type, name: f.author.name } } : {}),
		...(f.reviewedBy !== undefined
			? {
					reviewedBy: { "@type": "Person", name: f.reviewedBy.name },
					lastReviewed: f.reviewedBy.reviewedAt,
				}
			: {}),
		...(f.about !== undefined ? { about: { "@type": "Thing", name: f.about } } : {}),
	};
}
