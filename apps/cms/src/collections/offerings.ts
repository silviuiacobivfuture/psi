import { OFFERING_KINDS, Price } from "@psi/cms-client";
import type { CollectionConfig } from "payload";
import {
	createByBrand,
	deleteByBrand,
	readByBrand,
	readVersionsByBrand,
	updateByBrand,
} from "../authz/access";
import { brandListFilter } from "../brand/filter";
import { indexContent, unindexContent } from "../knowledge/ingest-content";
import { L } from "../labels";
import { authorUserField, brandField, reviewField, workflowField } from "../review/fields";
import { reviewGate } from "../review/gate";
import type { ReviewSpec } from "../review/spec";
import { announceChange, announceDeletion } from "../webhook/hooks";
import { validator, validSlug } from "./validate";
import { BRANDS } from "./vocabulary";

/**
 * Prices go through the same workflow as articles: an editor writes, a publisher (never the
 * author) approves both languages, a publisher publishes. Not clinical. What a price must hold is
 * @psi/cms-client's `Price`: the sites render only what parses.
 */
export const offeringReview: ReviewSpec = {
	slug: "offerings",
	reviewed: ["title", "summary", "slug", "kind", "brand", "price", "priceNote", "validFrom"],
	shared: ["slug", "kind", "brand", "price", "validFrom"],
	titleField: "title",
	requiredLocales: ["ro", "en"],
	signsReviewer: false,
	stampsPublishedAt: false,
	required: () => true,
	clinical: () => false,
	missing: (doc) => {
		const p = Price.safeParse({
			currency: "RON",
			...(typeof doc.price === "object" ? doc.price : {}),
		});
		return p.success ? [] : ["price"];
	},
};

const when = (...modes: string[]) => ({
	condition: (_: unknown, sibling: Record<string, unknown>): boolean =>
		modes.includes(String(sibling.mode)),
});

/** Services, programmes and protocols, with their prices: what the brand sites show. */
export const Offerings: CollectionConfig = {
	slug: "offerings",
	labels: {
		singular: { ro: "Ofertă și preț", en: "Offering and price" },
		plural: { ro: "Oferte și prețuri", en: "Offerings and prices" },
	},
	admin: {
		useAsTitle: "title",
		defaultColumns: ["title", "brand", "kind", "price.mode", "workflow", "_status", "demo"],
		baseListFilter: brandListFilter(BRANDS),
	},
	versions: { drafts: { autosave: { interval: 1500 } }, maxPerDoc: 50 },
	access: {
		read: readByBrand,
		readVersions: readVersionsByBrand,
		create: createByBrand,
		update: updateByBrand,
		delete: deleteByBrand,
	},
	indexes: [{ fields: ["brand", "slug"], unique: true }],
	hooks: {
		beforeChange: [reviewGate(offeringReview)],
		afterChange: [announceChange("offerings"), indexContent("offerings")],
		afterDelete: [announceDeletion("offerings"), unindexContent("offerings")],
	},
	fields: [
		{ name: "title", type: "text", localized: true, required: true, label: L.title },
		{
			name: "summary",
			type: "textarea",
			localized: true,
			label: { ro: "Pe scurt", en: "Summary" },
		},
		{
			name: "price",
			type: "group",
			label: { ro: "Preț", en: "Price" },
			fields: [
				{
					name: "mode",
					type: "select",
					required: true,
					defaultValue: "on_request",
					label: { ro: "Cum se afișează", en: "Shown as" },
					options: [
						{ value: "fixed", label: { ro: "Preț fix", en: "Fixed price" } },
						{ value: "range", label: { ro: "Interval", en: "Range" } },
						{ value: "from", label: { ro: "De la", en: "From" } },
						{ value: "on_request", label: { ro: "La cerere", en: "On request" } },
					],
				},
				{
					name: "amount",
					type: "number",
					min: 1,
					label: { ro: "Suma", en: "Amount" },
					admin: when("fixed"),
				},
				{
					name: "from",
					type: "number",
					min: 1,
					label: { ro: "De la", en: "From" },
					admin: when("range", "from"),
				},
				{
					name: "to",
					type: "number",
					min: 1,
					label: { ro: "Până la", en: "To" },
					admin: when("range"),
				},
				{
					name: "currency",
					type: "select",
					defaultValue: "RON",
					options: [{ value: "RON", label: "RON (lei)" }],
					admin: { readOnly: true },
				},
			],
		},
		{
			name: "priceNote",
			type: "text",
			localized: true,
			label: { ro: "Notă la preț", en: "Price note" },
		},
		{
			name: "reviewPanel",
			type: "ui",
			admin: { position: "sidebar", components: { Field: "/components/ReviewPanel#ReviewPanel" } },
		},
		brandField(BRANDS),
		{
			name: "slug",
			type: "text",
			required: true,
			index: true,
			label: L.slug,
			admin: { position: "sidebar" },
			validate: validator(validSlug, true),
		},
		{
			name: "kind",
			type: "select",
			required: true,
			defaultValue: "service",
			label: L.kind,
			admin: { position: "sidebar" },
			options: OFFERING_KINDS.map((k) => ({ value: k, label: k })),
		},
		{
			name: "validFrom",
			type: "date",
			label: { ro: "Valabil de la", en: "Valid from" },
			admin: { position: "sidebar" },
		},
		{
			name: "sortOrder",
			type: "number",
			defaultValue: 0,
			label: { ro: "Ordine", en: "Order" },
			admin: { position: "sidebar" },
		},
		{
			name: "demo",
			type: "checkbox",
			defaultValue: false,
			label: { ro: "DEMO (nu e un preț real)", en: "DEMO (not a real price)" },
			admin: { position: "sidebar" },
		},
		workflowField,
		authorUserField,
		reviewField,
	],
};
