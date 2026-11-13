import { defineTable } from "convex/server";
import { v } from "convex/values";
import { personValidator } from "../validators";

/**
 * What the staff API keeps that the clinic tables have no home for. Both are per app and start every index with it.
 * `apiDefinitions`: the builder's definitions exactly as the API takes them (all five kinds, the API's own id and
 * body, versioned); a form is mirrored into `formDefinitions` so records can be written against it.
 * `leaveRequests`: a request for leave with its decision (the roster days follow when it is approved).
 */
export const apiDefinitions = defineTable({
	tenant: v.string(),
	kind: v.string(),
	key: v.string(),
	version: v.number(),
	name: v.object({ ro: v.string(), en: v.string() }),
	/** JSON text: the body as given, parsed with zod where it is read. */
	body: v.string(),
	createdAt: v.number(),
	updatedAt: v.number(),
}).index("by_tenant_key", ["tenant", "key"]);

export const leaveRequests = defineTable({
	tenant: v.string(),
	person: personValidator,
	personKey: v.string(),
	from: v.string(),
	to: v.string(),
	kind: v.union(v.literal("co"), v.literal("cm")),
	status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
	decidedBy: v.optional(v.string()),
	createdAt: v.number(),
	updatedAt: v.number(),
	version: v.number(),
})
	.index("by_tenant_from", ["tenant", "from"])
	.index("by_tenant_person", ["tenant", "personKey"]);
