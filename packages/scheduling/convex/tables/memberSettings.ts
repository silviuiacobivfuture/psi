import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * A person's own settings in an app (language, theme, first calendar view, quiet hours, channels per kind), one row
 * per (app, subject). The body is JSON text the service validated; Convex keeps it whole. It holds no clinic data.
 */
export const memberSettings = defineTable({
	tenant: v.string(),
	subject: v.string(),
	body: v.string(),
	updatedAt: v.number(),
}).index("by_tenant_subject", ["tenant", "subject"]);
