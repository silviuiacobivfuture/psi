import { defineTable } from "convex/server";
import { v } from "convex/values";
import { audienceValidator, contactValidator, localeValidator } from "./validators";

/** When the visitor would like the call: the booking form's three answers. */
export const callbackWhenValidator = v.union(
	v.literal("morning"),
	v.literal("afternoon"),
	v.literal("any"),
);

/** Where the request came from: the site's form, or the form inside the guide's conversation. */
export const callbackChannelValidator = v.union(v.literal("form"), v.literal("guide"));

export const callbackStatusValidator = v.union(v.literal("new"), v.literal("handled"));

/**
 * A callback request: a visitor asked to be called back, or asked for a time that could not be
 * held. Stored first, so the request outlives any failure of the notification. The contact is
 * erased by retention once the team has handled it (`callbackRetentionAction`); a visitor-chosen
 * time and service are logistics, never a reason for the visit.
 */
export const callbackRequests = defineTable({
	/** The app (a brand) the request was made on: `psizone`, `hemisync`. Every read filters by it. */
	tenant: v.string(),
	/** Absent once retention erased it. */
	contact: v.optional(contactValidator),
	audience: audienceValidator,
	when: callbackWhenValidator,
	/** A slot the visitor chose that could not be held (UTC ms), when there was one. */
	preferredStart: v.optional(v.number()),
	/** The service slug asked for, when the form had one. */
	service: v.optional(v.string()),
	locale: localeValidator,
	channel: callbackChannelValidator,
	/** The page path the form was on: "/contact". */
	page: v.string(),
	/** The visitor ticked the consent box; a request without it is never stored. */
	consent: v.boolean(),
	status: callbackStatusValidator,
	createdAt: v.number(),
	handledAt: v.optional(v.number()),
	handledBy: v.optional(v.string()),
})
	.index("by_tenant_created", ["tenant", "createdAt"])
	.index("by_tenant_status_created", ["tenant", "status", "createdAt"]);
