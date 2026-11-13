import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * What the calendar's columns and the roster are made of. Practitioners (in `schema.ts`), devices,
 * group activities and staff members are DISTINCT tables: a device or a group activity can never
 * be offered as a person. Every index starts with the app (`tenant`); `legacyId` is the old app's
 * id (`<table>:<id>`) and `fingerprint` a keyed hash of the source row, so a re-import is a no-op.
 */

export const devices = defineTable({
	tenant: v.string(),
	/** What the service's API holds about this row that no column here does (JSON text, `apiCatalogExtra`). Wiped with the row. */
	extra: v.optional(v.string()),
	slug: v.string(),
	name: v.string(),
	kind: v.union(v.literal("neurofeedback"), v.literal("other")),
	active: v.boolean(),
	color: v.optional(v.string()),
	background: v.optional(v.string()),
	sortOrder: v.optional(v.number()),
	legacyId: v.optional(v.string()),
	fingerprint: v.optional(v.string()),
	version: v.number(),
	updatedAt: v.number(),
})
	.index("by_tenant_slug", ["tenant", "slug"])
	.index("by_tenant_legacy", ["tenant", "legacyId"]);

export const groupActivities = defineTable({
	tenant: v.string(),
	/** What the service's API holds about this row that no column here does (JSON text, `apiCatalogExtra`). Wiped with the row. */
	extra: v.optional(v.string()),
	slug: v.string(),
	name: v.string(),
	shortName: v.optional(v.string()),
	active: v.boolean(),
	color: v.optional(v.string()),
	background: v.optional(v.string()),
	sortOrder: v.optional(v.number()),
	legacyId: v.optional(v.string()),
	fingerprint: v.optional(v.string()),
	version: v.number(),
	updatedAt: v.number(),
})
	.index("by_tenant_slug", ["tenant", "slug"])
	.index("by_tenant_legacy", ["tenant", "legacyId"]);

/** Reception, other roster-only people and volunteers: on the roster, never bookable. */
export const staffMembers = defineTable({
	tenant: v.string(),
	/** What the service's API holds about this row that no column here does (JSON text, `apiCatalogExtra`). Wiped with the row. */
	extra: v.optional(v.string()),
	name: v.string(),
	kind: v.union(v.literal("reception"), v.literal("other"), v.literal("volunteer")),
	active: v.boolean(),
	/** The sign-in subject, once the person has an account. */
	subject: v.optional(v.string()),
	legacyId: v.optional(v.string()),
	fingerprint: v.optional(v.string()),
	version: v.number(),
	updatedAt: v.number(),
})
	.index("by_tenant_legacy", ["tenant", "legacyId"])
	.index("by_tenant_subject", ["tenant", "subject"]);
