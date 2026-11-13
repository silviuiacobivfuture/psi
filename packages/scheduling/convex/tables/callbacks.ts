import { defineTable } from "convex/server";
import { v } from "convex/values";
import {
	audienceValidator,
	contactValidator,
	decisionReasonValidator,
	localeValidator,
} from "../validators";

/**
 * A callback request: someone left a name and a way to reach them and asked the team to call, with no slot chosen. It
 * waits in the same list as the booking requests (`webRequests:callbacks`) and is decided the same way (decline,
 * cancel, or handled once called back; there is nothing to confirm). Contact data, so the web-request retention reaches it like any other request.
 */
export const callbackRequests = defineTable({
	tenant: v.string(),
	/** Public, readable reference (`K7M3-9QXA`), like a booking's. */
	reference: v.string(),
	contact: contactValidator,
	audience: v.optional(audienceValidator),
	locale: localeValidator,
	status: v.union(
		v.literal("open"),
		v.literal("declined"),
		v.literal("cancelled"),
		/** The team called back. */
		v.literal("handled"),
	),
	decidedBy: v.optional(v.string()),
	decisionReason: v.optional(decisionReasonValidator),
	createdAt: v.number(),
	updatedAt: v.number(),
})
	.index("by_reference", ["reference"])
	.index("by_tenant_created", ["tenant", "createdAt"])
	.index("by_tenant_updated", ["tenant", "updatedAt"]);
