import type { Tab } from "payload";
import { L } from "../labels";
import { validator, validSeoDescription, validSeoTitle, validSlug } from "./validate";

/** Limits of @psi/content (`Seo`, `Faq`, the article's `related`). */
export const FAQ_MAX = 10;
export const RELATED_MAX = 8;
export const KEYWORDS_MAX = 12;

/**
 * The article's search and answer surface: what search engines and link previews show (`seo`),
 * the questions people ask (`faq`, marked up on the page and indexed for the guide) and the
 * articles to link to (`related`). All optional: an older article has none of it.
 */
export const seoTab: Tab = {
	label: { ro: "SEO și întrebări", en: "SEO and questions" },
	fields: [
		{
			name: "seo",
			type: "group",
			label: L.seo,
			fields: [
				{
					name: "title",
					type: "text",
					localized: true,
					label: L.seoTitle,
					validate: validator(validSeoTitle),
				},
				{
					name: "description",
					type: "textarea",
					localized: true,
					label: L.seoDescription,
					validate: validator(validSeoDescription),
				},
				{
					name: "keywords",
					type: "array",
					localized: true,
					maxRows: KEYWORDS_MAX,
					label: L.seoKeywords,
					admin: {
						description: {
							ro: "Expresiile pe care le caută oamenii; prima este cea principală.",
							en: "The phrases people search for; the first is the main one.",
						},
					},
					fields: [{ name: "keyword", type: "text", required: true, label: L.seoKeyword }],
				},
			],
		},
		{
			name: "faq",
			type: "array",
			maxRows: FAQ_MAX,
			label: L.faq,
			admin: {
				description: {
					ro: "Întrebări reale, cu răspuns de 40–120 de cuvinte; apar pe pagină și în ghid.",
					en: "Real questions, answered in 40–120 words; shown on the page and known to the guide.",
				},
			},
			fields: [
				{
					name: "q",
					type: "text",
					localized: true,
					required: true,
					label: L.faqQuestion,
				},
				{
					name: "a",
					type: "textarea",
					localized: true,
					required: true,
					label: L.faqAnswer,
				},
			],
		},
		{
			name: "related",
			type: "array",
			maxRows: RELATED_MAX,
			label: L.related,
			admin: {
				description: {
					ro: "Adresele (slug) articolelor la care trimite acest text. Cele necunoscute se ignoră.",
					en: "Slugs of the articles this one links to. Unknown slugs are ignored.",
				},
			},
			fields: [
				{
					name: "slug",
					type: "text",
					required: true,
					label: L.relatedSlug,
					validate: validator(validSlug, true),
				},
			],
		},
	],
};
