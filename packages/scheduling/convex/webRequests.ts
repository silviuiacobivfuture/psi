import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireServer } from "./guard";
import { actorValidator, serverKeyValidator } from "./validators";

/**
 * What the staff console needs of the web requests beyond the booking list (`staffRequests:requests`) and the callback
 * requests of slice 0 (`callbacks:create`, `callbacks:list`): the callbacks as requests (their id is their reference),
 * the count waiting, "called back" with a string id (so an id that is not one is `not_found`, not a validation error),
 * and a LIVE feed of what arrived or changed, which the API subscribes to (`ConvexClient.onUpdate`) for its requests
 * stream and its inbox badge. Entries carry a reference and a time: no contact data.
 */
const PAGE = 200;
const MAX_LIST_MS = 62 * 86_400_000;

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
				reference: r._id,
				status: r.status,
				createdAt: r.createdAt,
				...(r.contact === undefined ? {} : { contact: r.contact }),
			})),
		};
	},
});

/** The team called back. Once: a callback already handled is refused, so a second click does not look like a first. */
export const handleCallback = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		reference: v.string(),
		actor: actorValidator,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const id = ctx.db.normalizeId("callbackRequests", args.reference);
		const row = id === null ? null : await ctx.db.get(id);
		if (row === null || row.tenant !== args.tenant)
			return { ok: false as const, reason: "not_found" as const };
		if (row.status === "handled") return { ok: false as const, reason: "not_allowed" as const };
		await ctx.db.patch(row._id, {
			status: "handled",
			handledAt: Date.now(),
			handledBy: args.actor.subject,
		});
		return { ok: true as const };
	},
});

/** Is this reference a callback of the app? (`decline` and `cancel` ask, because only a booking can be declined.) */
export const isCallback = query({
	args: { key: serverKeyValidator, tenant: v.string(), reference: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const id = ctx.db.normalizeId("callbackRequests", args.reference);
		const row = id === null ? null : await ctx.db.get(id);
		return { ok: true as const, found: row !== null && row.tenant === args.tenant };
	},
});

/** How many requests wait for the team: booking requests starting at or after `from`, and callbacks not yet called back. */
export const pending = query({
	args: { key: serverKeyValidator, tenant: v.string(), from: v.number() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const booked = await ctx.db
			.query("appointments")
			.withIndex("by_tenant_start", (q) => q.eq("tenant", args.tenant).gte("start", args.from))
			.collect();
		const waiting = await ctx.db
			.query("callbackRequests")
			.withIndex("by_tenant_status_created", (q) => q.eq("tenant", args.tenant).eq("status", "new"))
			.collect();
		return {
			ok: true as const,
			count: booked.filter((a) => a.status === "requested").length + waiting.length,
		};
	},
});

/**
 * Live: the requests (bookings that left the form, and callbacks) that arrived or changed after `cursor` (ms), oldest
 * first. Subscribed, the query re-runs when one arrives or changes. A held slot that never became a request is not one.
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
		const arrived = await ctx.db
			.query("callbackRequests")
			.withIndex("by_tenant_created", (q) =>
				q.eq("tenant", args.tenant).gt("createdAt", args.cursor),
			)
			.take(PAGE);
		const handled = await ctx.db
			.query("callbackRequests")
			.withIndex("by_tenant_handled", (q) =>
				q.eq("tenant", args.tenant).gt("handledAt", args.cursor),
			)
			.take(PAGE);
		const changes = [
			...booked
				.filter((a) => a.status !== "held" && a.status !== "expired")
				.map((a) => ({ reference: a.reference, at: a.updatedAt })),
			...arrived.map((c) => ({ reference: c._id as string, at: c.createdAt })),
			...handled.map((c) => ({ reference: c._id as string, at: c.handledAt ?? c.createdAt })),
		].sort((a, b) => a.at - b.at);
		return { ok: true as const, changes, cursor: changes.at(-1)?.at ?? args.cursor };
	},
});
