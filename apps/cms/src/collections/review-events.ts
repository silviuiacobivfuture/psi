import type { CollectionConfig } from "payload";
import { readByBrandField } from "../authz/scoped";
import { L } from "../labels";
import { TRAIL_ACTIONS } from "../review/trail";

/**
 * The editorial log: every submit, approval, rejection, publication, withdrawal and deletion,
 * appended by the server and never edited or removed (ported from the stopped CMS slice's
 * append-only ReviewEvents; publish/unpublish/delete rows are new).
 */
export const ReviewEvents: CollectionConfig = {
	slug: "review-events",
	labels: L.reviewEvents,
	admin: {
		useAsTitle: "title",
		defaultColumns: ["createdAt", "action", "title", "locale", "actor", "brand"],
	},
	access: {
		read: readByBrandField,
		create: () => false,
		update: () => false,
		delete: () => false,
	},
	fields: [
		{ name: "collectionSlug", type: "text", required: true },
		{ name: "documentId", type: "text", required: true, index: true },
		{ name: "brand", type: "text", index: true },
		{ name: "title", type: "text" },
		{ name: "locale", type: "text" },
		{
			name: "action",
			type: "select",
			required: true,
			options: TRAIL_ACTIONS.map((a) => ({ label: a, value: a })),
		},
		{ name: "actor", type: "relationship", relationTo: "users" },
		{ name: "authorizer", type: "text" },
		{ name: "contentHash", type: "text" },
		{ name: "notes", type: "textarea" },
	],
	timestamps: true,
};
