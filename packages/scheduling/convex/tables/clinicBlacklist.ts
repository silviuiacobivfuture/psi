import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Who may not book (src/clinic/blacklist.ts). An entry names a client record and/or a phone
 * (E.164) and/or an e-mail (lower-cased); the reason is staff-only free text and never leaves the
 * staff wrappers. Every change appends an audit event (field names, never the reason).
 */

export const blacklistCategoryValidator = v.union(
	v.literal("no_show_repeated"),
	v.literal("unpaid"),
	v.literal("abusive"),
	v.literal("duplicate"),
	v.literal("other"),
);

export const blacklistSeverityValidator = v.union(
	v.literal("warn"),
	v.literal("block_online"),
	v.literal("block_all"),
);

export const blacklistEntries = defineTable({
	tenant: v.string(),
	client: v.optional(v.id("clients")),
	phone: v.optional(v.string()),
	email: v.optional(v.string()),
	name: v.optional(v.string()),
	reason: v.string(),
	category: blacklistCategoryValidator,
	severity: blacklistSeverityValidator,
	active: v.boolean(),
	expiresAt: v.optional(v.number()),
	createdBy: v.string(),
	createdAt: v.number(),
	updatedBy: v.string(),
	updatedAt: v.number(),
	/** The key an entry seeded from a file carries, so a re-run finds it again. */
	seedKey: v.optional(v.string()),
	version: v.number(),
})
	.index("by_tenant_active", ["tenant", "active"])
	.index("by_tenant_seed", ["tenant", "seedKey"])
	.index("by_tenant_client", ["tenant", "client"]);

/**
 * What the blacklist did to a booking: an online request refused, or a staff override. Written in
 * the same transaction as the audit event. A staff refusal (blocked, warning) writes nothing: it
 * changed nothing and the person tries again with an override. The override reason is stored here.
 */
export const blacklistEvents = defineTable({
	tenant: v.string(),
	at: v.number(),
	kind: v.union(v.literal("online_refused"), v.literal("overridden")),
	/** The entry's id as text (the entry may be deleted later; the event stays). */
	entry: v.string(),
	severity: blacklistSeverityValidator,
	category: blacklistCategoryValidator,
	matchedBy: v.union(v.literal("client"), v.literal("phone"), v.literal("email")),
	/** Where it happened: the booking form, the chat guide, the callback form, or staff. */
	channel: v.union(
		v.literal("form"),
		v.literal("guide"),
		v.literal("callback"),
		v.literal("staff"),
	),
	/** Staff only: who overrode, with what authority, and why. */
	actor: v.optional(v.string()),
	authority: v.optional(v.string()),
	overrideReason: v.optional(v.string()),
	/** The visit or request the booking was for, when there is one. */
	subject: v.optional(v.string()),
})
	.index("by_tenant_at", ["tenant", "at"])
	.index("by_tenant_entry", ["tenant", "entry", "at"]);
