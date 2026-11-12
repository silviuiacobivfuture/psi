import type { Field } from "payload";
import { serverOnly, signedInOnly } from "../authz/access";
import { BRANDS } from "../authz/types";
import { L } from "../labels";
import { REVIEW_STATES, STAGES } from "./spec";

/** Written by the server only, and hidden from anonymous readers of the published API. */
const internal = { ...serverOnly, read: signedInOnly };

/** The brand every entry belongs to; access is decided per brand. Articles take the three. */
export function brandField(brands: ReadonlyArray<string> = BRANDS): Field {
	return {
		name: "brand",
		type: "select",
		required: true,
		index: true,
		label: L.brand,
		options: brands.map((b) => ({ label: b, value: b })),
		admin: { position: "sidebar" },
	};
}

/** Who wrote it (set on create): the reviewer may not be the author. */
export const authorUserField: Field = {
	name: "authorUser",
	type: "relationship",
	relationTo: "users",
	index: true,
	label: L.authorUser,
	access: internal,
	admin: { readOnly: true, position: "sidebar" },
};

/** Where the document is in the editorial workflow; moved by the review endpoints only. */
export const workflowField: Field = {
	name: "workflow",
	type: "group",
	label: L.workflow,
	access: internal,
	admin: { readOnly: true, position: "sidebar" },
	fields: [
		{
			name: "stage",
			type: "select",
			defaultValue: "draft",
			index: true,
			label: L.stage,
			options: STAGES.map((s) => ({ label: s, value: s })),
		},
		{ name: "submittedAt", type: "date" },
		{ name: "submittedBy", type: "relationship", relationTo: "users" },
	],
};

/**
 * The review record, one per locale. Written only by the review endpoints (POST /api/review/…);
 * field access refuses it from every form and API write; the notes and the reviewer's account are
 * never shown to anonymous readers.
 */
export const reviewField: Field = {
	name: "review",
	type: "group",
	localized: true,
	label: L.review,
	access: serverOnly,
	admin: { readOnly: true, position: "sidebar" },
	fields: [
		{
			name: "state",
			type: "select",
			defaultValue: "pending",
			options: REVIEW_STATES.map((s) => ({ label: s, value: s })),
		},
		{
			name: "reviewerUser",
			type: "relationship",
			relationTo: "users",
			access: { read: signedInOnly },
		},
		{ name: "reviewerName", type: "text" },
		{ name: "approvedAt", type: "date" },
		{ name: "approvedHash", type: "text", access: { read: signedInOnly } },
		{ name: "notes", type: "textarea", access: { read: signedInOnly } },
	],
};
