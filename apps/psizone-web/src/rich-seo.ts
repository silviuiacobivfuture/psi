import { faqPageJsonLd, type JsonLdNode } from "@psi/ui";
import type { RichPage } from "./content/rich/types";
import { ESTATE, SITE } from "./estate";
import { base, type Locale } from "./i18n";

/**
 * schema.org `MedicalWebPage` for a rich page, with the described procedure when it has one. No
 * `reviewedBy` or `lastReviewed`: nobody has signed these pages off yet.
 */
function medicalWebPage(
	locale: Locale,
	path: string,
	name: string,
	description: string,
	page: RichPage,
): JsonLdNode {
	const url = `${ESTATE[SITE]}${base(locale)}${path}`;
	return {
		"@context": "https://schema.org",
		"@type": "MedicalWebPage",
		name,
		description,
		url,
		inLanguage: locale,
		...(page.procedure === undefined ? {} : { about: { "@type": page.procedure.type, name, url } }),
	};
}

/** FAQPage and MedicalWebPage for a rich page; the FAQ text is the visible answers, verbatim. */
export function richJsonLd(
	locale: Locale,
	path: string,
	name: string,
	description: string,
	page: RichPage,
): ReadonlyArray<JsonLdNode> {
	return [
		medicalWebPage(locale, path, name, description, page),
		faqPageJsonLd(page.faq.map((f) => ({ question: f.q[locale], answer: f.a[locale] }))),
	];
}
