import { v } from "convex/values";
import { makeReference, type RandomBytes } from "../src/domain/tokens";
import { mutation, query } from "./_generated/server";
import { tenantBySlug } from "./calendar";
import { requireServer } from "./guard";
import {
	actorValidator,
	audienceValidator,
	contactValidator,
	decisionReasonValidator,
	localeValidator,
	serverKeyValidator,
} from "./validators";

/**
 * What the staff console needs of the web requests beyond the booking list (`staffRequests:requests`): callback
 * requests (a contact and no slot), the count waiting, and a LIVE feed of what arrived or changed, which the API
 * subscribes to (`ConvexClient.onUpdate`) for its requests stream and its inbox badge. Entries carry a reference, a
 * status and a time: no contact data.
 */
const PAGE = 200;
/** A reference is readable, not secret, and a mutation may not call crypto: Convex seeds Math.random per transaction. */
const mathRandom: RandomBytes = (length) =>
	Uint8Array.from({ length }, () => Math.floor(Math.random() * 256));
const MAX_LIST_MS = 62 * 86_400_000;

export const submitCallback = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		contact: contactValidator,
		audience: v.optional(audienceValidator),
		locale: localeValidator,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		if ((await tenantBySlug(ctx, args.tenant)) === undefined)
			return { ok: false as const, reason: "unknown_tenant" as const };
		if (args.contact.name.trim() === "" || (args.contact.phone ?? args.contact.email ?? "") === "")
			return { ok: false as const, reason: "invalid" as const };
		let reference = makeReference(mathRandom);
		for (let i = 0; i < 5; i += 1) {
			const clash = await ctx.db
				.query("callbackRequests")
				.withIndex("by_reference", (q) => q.eq("reference", reference))
				.first();
			if (clash === null) break;
			reference = makeReference(mathRandom);
		}
		const now = Date.now();
		await ctx.db.insert("callbackRequests", {
			tenant: args.tenant,
			reference,
			contact: args.contact,
			...(args.audience === undefined ? {} : { audience: args.audience }),
			locale: args.locale,
			status: "open",
			createdAt: now,
			updatedAt: now,
		});
		return { ok: true as const, reference };
	},
});

/** Callbacks created in [from, to), oldest first. */
export const callbacks = query({
	args: { key: serverKeyValidator, tenant: v.string(), from: v.number(), to: v.number() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const from = Math.max(args.from, args.to - MAX_LIST_MS);
		const rows = await ctx.db
			.query("callbackRequests")
			.withIndex("by_tenant_created", (q) =>
				q.eq("tenant", args.tenant).gte("createdAt", from).lt("createdAt", args.to),
			)
			.take(500);
		return {
			ok: true as const,
			callbacks: rows.map((r) => ({
				reference: r.reference,
				status: r.status,
				createdAt: r.createdAt,
				contact: r.contact,
			})),
		};
	},
});

export const decideCallback = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		reference: v.string(),
		decision: v.union(v.literal("decline"), v.literal("cancel"), v.literal("handle")),
		reason: v.optional(decisionReasonValidator),
		actor: actorValidator,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await ctx.db
			.query("callbackRequests")
			.withIndex("by_reference", (q) => q.eq("reference", args.reference))
			.first();
		if (row === null || row.tenant !== args.tenant)
			return { ok: false as const, reason: "not_found" as const };
		if (row.status !== "open") return { ok: false as const, reason: "not_allowed" as const };
		await ctx.db.patch(row._id, {
			status:
				args.decision === "decline"
					? "declined"
					: args.decision === "handle"
						? "handled"
						: "cancelled",
			decidedBy: args.actor.subject,
			decisionReason: args.reason,
			updatedAt: Date.now(),
		});
		return { ok: true as const };
	},
});

/** How many requests wait for the team: booking requests starting at or after `from`, and open callbacks. */
export const pending = query({
	args: { key: serverKeyValidator, tenant: v.string(), from: v.number() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const booked = await ctx.db
			.query("appointments")
			.withIndex("by_tenant_start", (q) => q.eq("tenant", args.tenant).gte("start", args.from))
			.collect();
		const callbacks = await ctx.db
			.query("callbackRequests")
			.withIndex("by_tenant_created", (q) => q.eq("tenant", args.tenant))
			.collect();
		return {
			ok: true as const,
			count:
				booked.filter((a) => a.status === "requested").length +
				callbacks.filter((c) => c.status === "open").length,
		};
	},
});

/**
 * Live: the requests (bookings that left the form, and callbacks) changed after `cursor` (an `updatedAt`, ms), oldest
 * first. Subscribed, the query re-runs when one arrives or changes. A held slot that never became a request is not
 * one.
 */
export const feed = query({
	args: { key: serverKeyValidator, tenant: v.string(), cursor: v.number() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const booked = await ctx.db
			.query("appointments")
			.withIndex("by_tenant_updated", (q) =>
				q.eq("tenant", args.tenant).gt("updatedAt", args.cursor),
			)
			.take(PAGE);
		const callbacks = await ctx.db
			.query("callbackRequests")
			.withIndex("by_tenant_updated", (q) =>
				q.eq("tenant", args.tenant).gt("updatedAt", args.cursor),
			)
			.take(PAGE);
		const changes = [
			...booked
				.filter((a) => a.status !== "held" && a.status !== "expired")
				.map((a) => ({ reference: a.reference, at: a.updatedAt })),
			...callbacks.map((c) => ({ reference: c.reference, at: c.updatedAt })),
		].sort((a, b) => a.at - b.at);
		return { ok: true as const, changes, cursor: changes.at(-1)?.at ?? args.cursor };
	},
});
