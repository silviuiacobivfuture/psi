import { type Block, type CollectionConfig, ValidationError } from "payload";
import { publishedOrSignedIn, signedIn } from "./access";
import { type ArticleDraft, missingForPublish } from "./publishable";
import { BRANDS, SLUG, TOPICS } from "./vocabulary";

const text = (name: string, label: { ro: string; en: string }): Block["fields"][number] => ({
	name,
	type: "textarea",
	localized: true,
	required: true,
	label,
});

/** The body's blocks, the same four the blog renders (packages/content/src/schema.ts). */
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

const TOPIC_LABELS: Readonly<Record<(typeof TOPICS)[number], { ro: string; en: string }>> = {
	autism: { ro: "Autism", en: "Autism" },
	adhd: { ro: "ADHD", en: "ADHD" },
	adolescenti: { ro: "Adolescenți", en: "Teenagers" },
	"integrare-senzoriala": { ro: "Integrare senzorială", en: "Sensory integration" },
	logopedie: { ro: "Logopedie", en: "Speech therapy" },
	qeeg: { ro: "QEEG", en: "QEEG" },
	"anxietate-depresie": { ro: "Anxietate și depresie", en: "Anxiety and depression" },
	editorial: { ro: "Editorial", en: "Editorial" },
};

/** The blog's articles: localised content, typed body blocks, the clinical-review rule enforced. */
export const Articles: CollectionConfig = {
	slug: "articles",
	labels: {
		singular: { ro: "Articol", en: "Article" },
		plural: { ro: "Articole", en: "Articles" },
	},
	admin: { useAsTitle: "title", defaultColumns: ["title", "brand", "topic", "status"] },
	access: { read: publishedOrSignedIn, create: signedIn, update: signedIn, delete: signedIn },
	hooks: {
		beforeValidate: [
			({ data, originalDoc }) => {
				const merged: ArticleDraft = { ...(originalDoc ?? {}), ...(data ?? {}) };
				const missing = missingForPublish(merged);
				if (missing.length > 0)
					throw new ValidationError({
						collection: "articles",
						errors: missing.map((path) => ({ path, message: "required to publish" })),
					});
				return data;
			},
		],
	},
	fields: [
		{
			name: "title",
			type: "text",
			localized: true,
			required: true,
			label: { ro: "Titlu", en: "Title" },
		},
		{
			name: "slug",
			type: "text",
			required: true,
			unique: true,
			index: true,
			label: { ro: "Adresă (slug)", en: "Slug" },
			validate: (v: string | null | undefined): true | string =>
				typeof v === "string" && SLUG.test(v) ? true : "lower-case-words-with-dashes",
		},
		{
			name: "brand",
			type: "select",
			required: true,
			label: { ro: "Brand", en: "Brand" },
			options: BRANDS.map((b) => ({ value: b, label: b })),
		},
		{
			name: "topic",
			type: "select",
			required: true,
			label: { ro: "Temă", en: "Topic" },
			options: TOPICS.map((t) => ({ value: t, label: TOPIC_LABELS[t] })),
		},
		{
			name: "backlogNo",
			type: "number",
			min: 1,
			max: 20,
			label: { ro: "Nr. în plan", en: "Backlog no." },
		},
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "in-review",
			label: { ro: "Stare", en: "Status" },
			options: [
				{ value: "in-review", label: { ro: "În revizuire", en: "In review" } },
				{ value: "published", label: { ro: "Publicat", en: "Published" } },
			],
		},
		{
			name: "kind",
			type: "select",
			label: { ro: "Tip", en: "Kind" },
			options: [
				{ value: "health", label: { ro: "Sănătate", en: "Health" } },
				{ value: "editorial", label: { ro: "Editorial", en: "Editorial" } },
			],
		},
		{
			name: "standfirst",
			type: "textarea",
			localized: true,
			label: { ro: "Șapou", en: "Standfirst" },
		},
		{ name: "publishedAt", type: "date", label: { ro: "Publicat la", en: "Published on" } },
		{ name: "body", type: "blocks", blocks: BODY, label: { ro: "Conținut", en: "Body" } },
		{
			name: "sources",
			type: "array",
			label: { ro: "Surse", en: "Sources" },
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
		{
			name: "authorTeam",
			type: "text",
			localized: true,
			label: { ro: "Echipa (editorial)", en: "Team (editorial)" },
		},
		{
			name: "author",
			type: "relationship",
			relationTo: "people",
			label: { ro: "Autor", en: "Author" },
		},
		{
			name: "reviewer",
			type: "relationship",
			relationTo: "people",
			label: { ro: "Revizor clinic", en: "Clinical reviewer" },
		},
		{ name: "reviewedAt", type: "date", label: { ro: "Revizuit la", en: "Reviewed on" } },
	],
};
