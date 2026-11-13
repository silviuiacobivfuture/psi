import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Roles, members and scope relations, all data per app (`src/permissions`). The catalogue is code;
 * what a role holds is a list of its keys. Deny overrides win.
 */

export const roles = defineTable({
	tenant: v.string(),
	name: v.string(),
	description: v.string(),
	/** Keys of the permission catalogue. */
	permissions: v.array(v.string()),
	/** A role the app started with (still editable). */
	seeded: v.boolean(),
	updatedAt: v.number(),
	updatedBy: v.string(),
}).index("by_tenant_name", ["tenant", "name"]);

/** A person (sign-in subject) holds a role; several per person. */
export const roleMembers = defineTable({
	tenant: v.string(),
	subject: v.string(),
	role: v.id("roles"),
	createdAt: v.number(),
})
	.index("by_tenant_subject", ["tenant", "subject"])
	.index("by_tenant_role", ["tenant", "role"]);

export const permissionOverrides = defineTable({
	tenant: v.string(),
	subject: v.string(),
	permission: v.string(),
	effect: v.union(v.literal("grant"), v.literal("deny")),
	updatedAt: v.number(),
	updatedBy: v.string(),
}).index("by_tenant_subject", ["tenant", "subject"]);

/** `treating`: a practitioner treats a client. Changes only when a person asks (never implicitly). */
export const treating = defineTable({
	tenant: v.string(),
	practitioner: v.id("practitioners"),
	client: v.id("clients"),
	createdAt: v.number(),
	createdBy: v.string(),
	legacyId: v.optional(v.string()),
})
	.index("by_tenant_client", ["tenant", "client"])
	.index("by_tenant_practitioner", ["tenant", "practitioner"])
	.index("by_tenant_legacy", ["tenant", "legacyId"]);

/** `assigned_to`: a coordinator (subject) is assigned to a practitioner. */
export const coordinatorAssignments = defineTable({
	tenant: v.string(),
	subject: v.string(),
	practitioner: v.id("practitioners"),
	createdAt: v.number(),
})
	.index("by_tenant_subject", ["tenant", "subject"])
	.index("by_tenant_practitioner", ["tenant", "practitioner"]);
