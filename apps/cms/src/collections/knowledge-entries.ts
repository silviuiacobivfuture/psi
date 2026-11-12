import type { CollectionConfig } from "payload";
import {
	createByBrand,
	deleteByBrand,
	readByBrand,
	readVersionsByBrand,
	updateByBrand,
} from "../authz/access";
import { brandListFilter } from "../brand/filter";
import { indexKnowledge, unindexKnowledge } from "../knowledge/hooks";
import { knowledgeReviewRequired } from "../knowledge/rule";
import { L } from "../labels";
import { authorUserField, brandField, reviewField, workflowField } from "../review/fields";
import { reviewGate } from "../review/gate";
import type { ReviewSpec } from "../review/spec";
import { validAnswer, validator, validCitePath, validSlug } from "./validate";

/** Clinical entries and everything on Psizone are reviewed before the guide may use them. */
export const knowledgeReview: ReviewSpec = {
	slug: "knowledge-entries",
	reviewed: [
		"question",
		"slug",
		"answer",
		"citePath",
		"kind",
		"audience",
		"hub",
		"method",
		"brand",
	],
	shared: ["kind", "audience", "hub", "method", "brand"],
	titleField: "question",
	requiredLocales: [],
	signsReviewer: false,
	stampsPublishedAt: false,
	required: knowledgeReviewRequired,
	clinical: knowledgeReviewRequired,
	missing: () => [],
};

/**
 * One question or concept per entry, 80–250 words, in the shape @psi/knowledge ingests (ported
 * from the stopped CMS slice). Publishing an approved entry indexes it for the guide;
 * unpublishing or deleting removes it.
 */
export const KnowledgeEntries: CollectionConfig = {
	slug: "knowledge-entries",
	labels: L.knowledge,
	admin: {
		// In the "Platformă / Platform" group of the admin navigation (components/AdminNav.tsx).
		group: false,
		useAsTitle: "question",
		defaultColumns: ["question", "brand", "kind", "_status"],
		baseListFilter: brandListFilter(),
	},
	versions: { drafts: true, maxPerDoc: 50 },
	access: {
		read: readByBrand,
		readVersions: readVersionsByBrand,
		create: createByBrand,
		update: updateByBrand,
		delete: deleteByBrand,
	},
	hooks: {
		beforeChange: [reviewGate(knowledgeReview)],
		afterChange: [indexKnowledge],
		afterDelete: [unindexKnowledge],
	},
	fields: [
		brandField(),
		{
			name: "kind",
			label: L.kind,
			type: "select",
			required: true,
			defaultValue: "clinical",
			options: ["clinical", "programme", "operational", "editorial"],
			admin: { position: "sidebar" },
		},
		{ name: "question", label: L.question, type: "text", required: true, localized: true },
		{
			name: "slug",
			label: L.slug,
			type: "text",
			localized: true,
			validate: validator(validSlug),
		},
		{
			name: "answer",
			label: L.answer,
			type: "textarea",
			required: true,
			localized: true,
			validate: validator(validAnswer, true),
		},
		{
			name: "citePath",
			label: L.citePath,
			type: "text",
			required: true,
			localized: true,
			validate: validator(validCitePath, true),
		},
		{ name: "audience", type: "text" },
		{ name: "hub", type: "text" },
		{ name: "method", type: "text" },
		{
			name: "reviewPanel",
			type: "ui",
			admin: {
				position: "sidebar",
				components: { Field: "/components/ReviewPanel#ReviewPanel" },
			},
		},
		workflowField,
		authorUserField,
		reviewField,
	],
};
