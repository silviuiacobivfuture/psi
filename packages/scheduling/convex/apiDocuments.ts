import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { REFUSED } from "./apiSupport";
import { requireServer } from "./guard";
import { actorValidator, serverKeyValidator } from "./validators";

/** The most one document holds (the serialized plan): the service checks it too, this is the store's own bound. */
export const MAX_DOCUMENT_CHARS = 512_000;
const kindValidator = v.union(v.literal("floor_plan"));

export const get = query({
	args: { key: serverKeyValidator, tenant: v.string(), kind: kindValidator },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await ctx.db
			.query("appDocuments")
			.withIndex("by_tenant_kind", (q) => q.eq("tenant", args.tenant).eq("kind", args.kind))
			.unique();
		return row === null
			? { ok: true as const, found: false as const }
			: {
					ok: true as const,
					found: true as const,
					revision: row.revision,
					body: row.body,
					updatedAt: row.updatedAt,
					updatedBy: row.updatedBy,
				};
	},
});

/**
 * Saves a document edited from `expected` (0: nothing stored yet). One transaction compares and writes, so two people saving
 * from the same revision cannot both win: the second is `stale`. The audit event is the service's (`floorplan.put`).
 */
export const put = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		kind: kindValidator,
		expected: v.number(),
		body: v.string(),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (
			args.body.length > MAX_DOCUMENT_CHARS ||
			!Number.isInteger(args.expected) ||
			args.expected < 0
		)
			return REFUSED("invalid");
		const tenant = await ctx.db
			.query("tenants")
			.withIndex("by_slug", (q) => q.eq("slug", args.tenant))
			.unique();
		if (tenant === null) return REFUSED("not_found");
		const row = await ctx.db
			.query("appDocuments")
			.withIndex("by_tenant_kind", (q) => q.eq("tenant", args.tenant).eq("kind", args.kind))
			.unique();
		if ((row?.revision ?? 0) !== args.expected) return REFUSED("stale");
		const revision = args.expected + 1;
		const now = Date.now();
		const fields = { revision, body: args.body, updatedAt: now, updatedBy: args.actor.subject };
		if (row === null)
			await ctx.db.insert("appDocuments", { tenant: args.tenant, kind: args.kind, ...fields });
		else await ctx.db.patch(row._id, fields);
		return { ok: true as const, revision, updatedAt: now };
	},
});
