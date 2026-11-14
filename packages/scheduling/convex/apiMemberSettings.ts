import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { REFUSED } from "./apiSupport";
import { requireServer } from "./guard";
import { serverKeyValidator } from "./validators";

/** The most one person's settings hold: the service checks it too, this is the store's own bound. */
export const MAX_SETTINGS_CHARS = 8_000;

export const get = query({
	args: { key: serverKeyValidator, tenant: v.string(), subject: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await ctx.db
			.query("memberSettings")
			.withIndex("by_tenant_subject", (q) =>
				q.eq("tenant", args.tenant).eq("subject", args.subject),
			)
			.unique();
		return row === null
			? { ok: true as const, found: false as const }
			: { ok: true as const, found: true as const, body: row.body, updatedAt: row.updatedAt };
	},
});

/** Replaces the person's settings in the app. The audit event is the service's (`settings.update`). */
export const put = mutation({
	args: { key: serverKeyValidator, tenant: v.string(), subject: v.string(), body: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const app = await ctx.db
			.query("tenants")
			.withIndex("by_slug", (q) => q.eq("slug", args.tenant))
			.unique();
		if (app === null) return REFUSED("not_found");
		if (args.body.length > MAX_SETTINGS_CHARS || args.subject === "") return REFUSED("invalid");
		const updatedAt = Date.now();
		const row = await ctx.db
			.query("memberSettings")
			.withIndex("by_tenant_subject", (q) =>
				q.eq("tenant", args.tenant).eq("subject", args.subject),
			)
			.unique();
		if (row === null)
			await ctx.db.insert("memberSettings", {
				tenant: args.tenant,
				subject: args.subject,
				body: args.body,
				updatedAt,
			});
		else await ctx.db.patch(row._id, { body: args.body, updatedAt });
		return { ok: true as const, updatedAt };
	},
});
