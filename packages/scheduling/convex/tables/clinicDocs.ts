import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Documents an app keeps beside its data, one per kind (today: the floor plan). `revision` counts the saves and is the
 * optimistic-concurrency token: a write names the revision it was edited from and is refused when the row has moved on.
 * The body is JSON text the service validated; Convex keeps it whole.
 */
export const appDocuments = defineTable({
	tenant: v.string(),
	kind: v.union(v.literal("floor_plan")),
	revision: v.number(),
	body: v.string(),
	updatedAt: v.number(),
	updatedBy: v.string(),
}).index("by_tenant_kind", ["tenant", "kind"]);
