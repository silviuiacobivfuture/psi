import type { Block, CollectionConfig, FieldHook } from "payload";
import { brandAccess, serverOnly, signedInOnly } from "../authz/access";
import { indexContent, unindexContent } from "../knowledge/ingest-content";
import { L } from "../labels";
import { previewUrl } from "../preview/url";
import { authorUserField, brandField, reviewField, workflowField } from "../review/fields";
import { reviewGate } from "../review/gate";
import type { ReviewSpec } from "../review/spec";
import { announceArticle, announceDeleted } from "../webhook/hooks";
import { seoTab } from "./article-seo";
import { asArticleDraft, missingForPublish } from "./publishable";
import { validator, validSlug, validStandfirst } from "./validate";
import { BRANDS, TOPIC_LABELS, TOPICS } from "./vocabulary";

const text = (name: string, label: { ro: string; en: string }): Block["fields"][number] => ({
	name,
	type: "textarea",
	localized: true,
	required: true,
	label,
});

/** The body's blocks, the same four the blog renders (@psi/content `Block`). */
const BODY: Block[] = [
	{
		slug: "p",
		labels: {
			singular: { ro: "Paragraf", en: "Paragraph" },
			plural: { ro: "Paragrafe", en: "Paragraphs" },
		},
		fields: [text("text", { ro: "Text", en: "Text" })],
	},
	{
		slug: "h2",
		labels: {
			singular: { ro: "Subtitlu", en: "Heading" },
			plural: { ro: "Subtitluri", en: "Headings" },
		},
		fields: [text("text", { ro: "Text", en: "Text" })],
	},
	{
		slug: "quote",
		labels: { singular: { ro: "Citat", en: "Quote" }, plural: { ro: "Citate", en: "Quotes" } },
		fields: [text("text", { ro: "Text", en: "Text" })],
	},
	{
		slug: "list",
		labels: { singular: { ro: "Listă", en: "List" }, plural: { ro: "Liste", en: "Lists" } },
		fields: [
			{
				name: "items",
				type: "array",
				minRows: 1,
				required: true,
				label: { ro: "Elemente", en: "Items" },
				fields: [text("text", { ro: "Text", en: "Text" })],
			},
		],
	},
];

/** Romanian title → slug when the slug is left empty: lower case, no diacritics, dashes. */
export function slugify(title: string): string {
	return title
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80)
		.replace(/-+$/g, "");
}

const slugFromTitle: FieldHook = ({ value, siblingData }) => {
	if (typeof value === "string" && value !== "") return value;
	const t: unknown = siblingData.title;
	return typeof t === "string" && t.trim() !== "" ? slugify(t) : value;
};

/**
 * Every article is approved before it is published: a health article by a clinical reviewer
 * (`clinical_review`), any other by a publisher (`publish`). Both locales are reviewed: the blog
 * publishes only articles written in Romanian and English.
 */
export const articleReview: ReviewSpec = {
	slug: "articles",
	reviewed: [
		"title",
		"slug",
		"standfirst",
		"body",
		"sources",
		"seo",
		"faq",
		"related",
		"cover",
		"kind",
		"topic",
		"brand",
		"authorTeam",
		"author",
	],
	// Fully unlocalised only: the body's blocks and the sources carry per-locale text, and are
	// read per locale from the stored draft (a structural change shows in every locale's hash).
	shared: ["slug", "cover", "kind", "topic", "brand", "author", "related"],
	// Added after articles were first approved: empty, they leave an earlier approval valid.
	optional: ["seo", "faq", "related"],
	titleField: "title",
	requiredLocales: ["ro", "en"],
	signsReviewer: true,
	stampsPublishedAt: true,
	required: () => true,
	clinical: (doc) => doc.kind === "health",
	missing: (doc) => missingForPublish(asArticleDraft(doc)),
};

/** The blog's articles: @psi/content's schema, authored per locale, through the review gate. */
export const Articles: CollectionConfig = {
	slug: "articles",
	labels: {
		singular: { ro: "Articol", en: "Article" },
		plural: { ro: "Articole", en: "Articles" },
	},
	admin: {
		useAsTitle: "title",
		defaultColumns: ["title", "brand", "topic", "kind", "workflow", "_status", "updatedAt"],
		listSearchableFields: ["title", "slug"],
		livePreview: { url: ({ data, locale }) => previewUrl(data.id, locale.code) },
		preview: (doc, { locale }) => previewUrl(doc.id, locale),
	},
	versions: { drafts: { autosave: { interval: 1500 } }, maxPerDoc: 50 },
	access: brandAccess(BRANDS),
	hooks: {
		beforeChange: [reviewGate(articleReview)],
		afterChange: [announceArticle, indexContent("articles")],
		afterDelete: [announceDeleted, unindexContent("articles")],
	},
	fields: [
		{
			type: "tabs",
			tabs: [
				{
					label: { ro: "Text", en: "Text" },
					fields: [
						{ name: "title", type: "text", localized: true, required: true, label: L.title },
						{
							name: "standfirst",
							type: "textarea",
							localized: true,
							label: L.standfirst,
							admin: {
								description: {
									ro: "Răspunde titlului, în cel mult 60 de cuvinte.",
									en: "Answers the headline, in 60 words at most.",
								},
							},
							validate: validator(validStandfirst),
						},
						{ name: "cover", type: "upload", relationTo: "media", label: L.cover },
						{ name: "body", type: "blocks", blocks: BODY, label: L.body },
					],
				},
				{
					label: { ro: "Surse și proveniență", en: "Sources and provenance" },
					fields: [
						{
							name: "sources",
							type: "array",
							label: L.sources,
							fields: [
								{
									name: "label",
									type: "text",
									localized: true,
									required: true,
									label: { ro: "Titlu", en: "Label" },
								},
								{ name: "href", type: "text", required: true, label: { ro: "Link", en: "Link" } },
							],
						},
						{ name: "aiDrafted", type: "checkbox", defaultValue: false, label: L.aiDrafted },
						{
							name: "provenance",
							type: "array",
							label: L.provenance,
							access: { read: signedInOnly },
							admin: {
								description: {
									ro: "Fișierele sau documentele din care vine fiecare fapt, pentru revizor.",
									en: "The files or documents every fact comes from, for the reviewer.",
								},
							},
							fields: [{ name: "entry", type: "text", required: true, label: L.provenanceEntry }],
						},
					],
				},
				seoTab,
				{
					label: { ro: "Semnătură", en: "Byline" },
					fields: [
						{
							name: "authorTeam",
							type: "text",
							localized: true,
							label: { ro: "Echipa (articol editorial)", en: "Team (editorial article)" },
						},
						{
							name: "author",
							type: "relationship",
							relationTo: "people",
							label: { ro: "Autor (articol de sănătate)", en: "Author (health article)" },
						},
						{
							name: "reviewer",
							type: "relationship",
							relationTo: "people",
							label: L.reviewerPerson,
							access: serverOnly,
							admin: {
								readOnly: true,
								description: {
									ro: "Pus de aprobarea revizorului clinic, nu se scrie de mână.",
									en: "Set by the clinical reviewer's approval, never typed in.",
								},
							},
						},
						{
							name: "reviewedAt",
							type: "date",
							label: L.reviewedAt,
							access: serverOnly,
							admin: { readOnly: true },
						},
					],
				},
			],
		},
		{
			name: "reviewPanel",
			type: "ui",
			admin: {
				position: "sidebar",
				components: { Field: "/components/ReviewPanel#ReviewPanel" },
			},
		},
		{
			name: "slug",
			type: "text",
			required: true,
			unique: true,
			index: true,
			label: L.slug,
			admin: { position: "sidebar" },
			hooks: { beforeValidate: [slugFromTitle] },
			validate: validator(validSlug, true),
		},
		brandField(BRANDS),
		{
			name: "topic",
			type: "select",
			required: true,
			label: { ro: "Temă", en: "Topic" },
			admin: { position: "sidebar" },
			options: TOPICS.map((t) => ({ value: t, label: TOPIC_LABELS[t] })),
		},
		{
			name: "kind",
			type: "select",
			required: true,
			defaultValue: "health",
			label: L.kind,
			admin: { position: "sidebar" },
			options: [
				{
					value: "health",
					label: { ro: "Sănătate (revizuire clinică)", en: "Health (clinical review)" },
				},
				{ value: "editorial", label: { ro: "Editorial", en: "Editorial" } },
			],
		},
		{
			name: "backlogNo",
			type: "number",
			min: 1,
			max: 20,
			label: { ro: "Nr. în plan", en: "Backlog no." },
			admin: { position: "sidebar" },
		},
		{
			name: "publishedAt",
			type: "date",
			label: L.publishedAt,
			admin: { position: "sidebar" },
		},
		workflowField,
		authorUserField,
		reviewField,
	],
};
