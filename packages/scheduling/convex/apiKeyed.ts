import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { REFUSED } from "./apiSupport";
import { requireServer } from "./guard";
import { serverKeyValidator } from "./validators";

/**
 * The engagement layer's small keyed documents (invitations, account links, notification preferences, the delivery
 * log), server-keyed. A mutation is a transaction, so `put` is an atomic compare-and-set on the revision. Nothing here
 * is audited: the service writes its own audit events for what a person did, and these rows hold no clinical data.
 */
export const MAX_BODY_CHARS = 16_000;
const MAX_LIMIT = 1000;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/;
const nsValidator = v.union(
	v.literal("invite"),
	v.literal("link"),
	v.literal("prefs"),
	v.literal("delivery"),
	v.literal("tick"),
);

export const get = query({
	args: { key: serverKeyValidator, tenant: v.string(), ns: nsValidator, entry: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await ctx.db
			.query("appKeyed")
			.withIndex("by_tenant_ns_key", (q) =>
				q.eq("tenant", args.tenant).eq("ns", args.ns).eq("key", args.entry),
			)
			.unique();
		return row === null
			? { ok: true as const, found: false as const }
			: {
					ok: true as const,
					found: true as const,
					body: row.body,
					revision: row.revision,
					updatedAt: row.updatedAt,
				};
	},
});

export const put = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		ns: nsValidator,
		entry: v.string(),
		expected: v.number(),
		body: v.string(),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (
			!KEY.test(args.entry) ||
			args.body.length > MAX_BODY_CHARS ||
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
			.query("appKeyed")
			.withIndex("by_tenant_ns_key", (q) =>
				q.eq("tenant", args.tenant).eq("ns", args.ns).eq("key", args.entry),
			)
			.unique();
		if ((row?.revision ?? 0) !== args.expected) return REFUSED("stale");
		const revision = args.expected + 1;
		const now = Date.now();
		if (row === null)
			await ctx.db.insert("appKeyed", {
				tenant: args.tenant,
				ns: args.ns,
				key: args.entry,
				body: args.body,
				revision,
				updatedAt: now,
			});
		else await ctx.db.patch(row._id, { body: args.body, revision, updatedAt: now });
		return { ok: true as const, revision, updatedAt: now };
	},
});

/** Entries whose key starts with `prefix`, by key. */
export const list = query({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		ns: nsValidator,
		prefix: v.string(),
		limit: v.number(),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const limit = Math.max(1, Math.min(MAX_LIMIT, Math.floor(args.limit)));
		const rows = await ctx.db
			.query("appKeyed")
			.withIndex("by_tenant_ns_key", (q) =>
				q
					.eq("tenant", args.tenant)
					.eq("ns", args.ns)
					.gte("key", args.prefix)
					.lt("key", `${args.prefix}￿`),
			)
			.take(limit);
		return {
			ok: true as const,
			entries: rows.map((r) => ({
				key: r.key,
				body: r.body,
				revision: r.revision,
				updatedAt: r.updatedAt,
			})),
		};
	},
});

export const remove = mutation({
	args: { key: serverKeyValidator, tenant: v.string(), ns: nsValidator, entry: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await ctx.db
			.query("appKeyed")
			.withIndex("by_tenant_ns_key", (q) =>
				q.eq("tenant", args.tenant).eq("ns", args.ns).eq("key", args.entry),
			)
			.unique();
		if (row === null) return { ok: true as const, removed: false as const };
		await ctx.db.delete(row._id);
		return { ok: true as const, removed: true as const };
	},
});
