import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * A member of an app, as the staff API knows one: the sign-in subject, the name the team sees, an e-mail for the
 * team's own use. Roles, personal overrides and coordinator assignments hang off the subject in their own tables;
 * this row is what makes a person a MEMBER (a person with no role still is one).
 */
export const memberProfiles = defineTable({
	tenant: v.string(),
	subject: v.string(),
	displayName: v.string(),
	email: v.optional(v.string()),
	createdAt: v.number(),
	updatedAt: v.number(),
})
	.index("by_tenant_subject", ["tenant", "subject"])
	.index("by_subject", ["subject"]);
