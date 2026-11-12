import type { CollectionConfig } from "payload";
import { readByBrandField } from "../authz/scoped";
import { BRANDS } from "../authz/types";

/**
 * The AI behaviour studio's drafts and history, per brand. A `draft` row (one per brand, edited in
 * place) holds settings saved but not live; every `published` row is a snapshot of what went live,
 * who did it and when, appended by the `ai-settings` global's hook (from the studio or from the
 * plain form alike) and never edited. Nothing here is a secret or a visitor's text. Written only
 * by the server, after its own `ai_admin` check; read by anyone who may read the brand.
 */
export const AiSettingsVersions: CollectionConfig = {
	slug: "ai-settings-versions",
	labels: {
		singular: { ro: "Versiune a setărilor AI", en: "AI settings version" },
		plural: { ro: "Versiunile setărilor AI", en: "AI settings versions" },
	},
	admin: { hidden: true, useAsTitle: "brand" },
	access: {
		read: readByBrandField,
		create: () => false,
		update: () => false,
		delete: () => false,
	},
	fields: [
		{
			name: "brand",
			type: "select",
			required: true,
			index: true,
			options: BRANDS.map((b) => ({ label: b, value: b })),
		},
		{
			name: "kind",
			type: "select",
			required: true,
			index: true,
			options: [
				{ label: { ro: "Ciornă", en: "Draft" }, value: "draft" },
				{ label: { ro: "Publicat", en: "Published" }, value: "published" },
			],
		},
		/** The brand's whole group (settings and behaviour), as it was saved or went live. */
		{ name: "settings", type: "json", required: true },
		/** Who saved or published it: the person's name (or e-mail), and their CMS user id. */
		{ name: "by", type: "text" },
		{ name: "byId", type: "text" },
		/** When it went live (a published row) or was last saved (the draft). */
		{ name: "at", type: "date", required: true, index: true },
		/** How it went live: `studio`, `revert`, `form` (the plain settings page) or `baseline`. */
		{ name: "note", type: "text" },
	],
	timestamps: true,
};
