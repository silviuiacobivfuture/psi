import { v } from "convex/values";
import { query } from "./_generated/server";
import { tenantBySlug } from "./calendar";
import { requireServer } from "./guard";
import { serverKeyValidator } from "./validators";

/** A tenant's active services and who offers them: what an app or the guide may offer. */
export const services = query({
	args: { key: serverKeyValidator, tenant: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const tenant = await tenantBySlug(ctx, args.tenant);
		if (tenant === undefined) return { ok: false as const, reason: "unknown_tenant" as const };
		const rows = await ctx.db
			.query("services")
			.withIndex("by_tenant_slug", (q) => q.eq("tenant", tenant.slug))
			.collect();
		const services = [];
		for (const row of rows.filter((r) => r.active)) {
			const practitioners = [];
			for (const id of row.practitioners) {
				const p = await ctx.db.get(id);
				if (p?.active) practitioners.push({ id: p._id, name: p.displayName });
			}
			services.push({
				slug: row.slug,
				durationMinutes: row.durationMinutes,
				modes: row.modes,
				...(row.location === undefined ? {} : { location: row.location }),
				practitioners,
			});
		}
		return { ok: true as const, timeZone: tenant.timeZone, services };
	},
});
