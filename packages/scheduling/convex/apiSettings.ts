import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { REFUSED, record } from "./apiSupport";
import { requireServer } from "./guard";
import { actorValidator, localeValidator, serverKeyValidator } from "./validators";

/** An app's name and settings (kind and zone are fixed when the app is made). */
export const get = query({
	args: { key: serverKeyValidator, tenant: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const t = await ctx.db
			.query("tenants")
			.withIndex("by_slug", (q) => q.eq("slug", args.tenant))
			.unique();
		return t === null
			? REFUSED("not_found")
			: {
					ok: true as const,
					name: t.name,
					kind: t.kind,
					timeZone: t.timeZone,
					settings: t.settings,
				};
	},
});

export const set = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		name: v.optional(v.string()),
		defaultLocale: v.optional(localeValidator),
		currency: v.optional(v.string()),
		address: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const t = await ctx.db
			.query("tenants")
			.withIndex("by_slug", (q) => q.eq("slug", args.tenant))
			.unique();
		if (t === null) return REFUSED("not_found");
		if (
			(args.name !== undefined && args.name.trim() === "") ||
			(args.currency !== undefined && !/^[A-Z]{3}$/.test(args.currency))
		)
			return REFUSED("invalid");
		const settings = {
			defaultLocale: args.defaultLocale ?? t.settings?.defaultLocale ?? "ro",
			currency: args.currency ?? t.settings?.currency ?? "RON",
			address: args.address ?? t.settings?.address,
		};
		await ctx.db.patch(t._id, { name: args.name?.trim() ?? t.name, settings });
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "builder.change",
			entity: "builder",
			entityId: t._id,
			kind: "setting",
			version: 1,
			fields: ["settings"],
		});
		return { ok: true as const };
	},
});
