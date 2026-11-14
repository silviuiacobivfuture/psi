import { type Infer, v } from "convex/values";
import {
	internalMutation,
	internalQuery,
	type MutationCtx,
	type QueryCtx,
} from "./_generated/server";
import { encryptedValidator } from "./validators";

/**
 * The per-app data keys, wrapped by the master key (`CLINIC_MASTER_KEY`, which lives with the
 * process that encrypts and never here). Convex stores and returns wrapped keys; it can neither
 * wrap nor unwrap one. Internal: reached with the admin key.
 */
export const list = internalQuery({
	args: { tenant: v.string() },
	returns: v.array(v.object({ version: v.number(), wrapped: encryptedValidator })),
	handler: (ctx, { tenant }) => wrappedKeysOf(ctx, tenant),
});

/** The stored wrapped keys of an app, by version. */
export async function wrappedKeysOf(ctx: QueryCtx, tenant: string) {
	const rows = await ctx.db
		.query("appKeys")
		.withIndex("by_tenant_version", (q) => q.eq("tenant", tenant))
		.collect();
	return rows.map((k) => ({ version: k.version, wrapped: k.wrapped }));
}

/** Stores a wrapped key as the next version; a version that exists is never replaced. */
export async function installWrappedKey(
	ctx: MutationCtx,
	{
		tenant,
		version,
		wrapped,
	}: { tenant: string; version: number; wrapped: Infer<typeof encryptedValidator> },
): Promise<"installed" | "exists"> {
	const found = await ctx.db
		.query("appKeys")
		.withIndex("by_tenant_version", (q) => q.eq("tenant", tenant).eq("version", version))
		.unique();
	if (found !== null) return "exists";
	await ctx.db.insert("appKeys", {
		tenant,
		version,
		wrapped,
		status: "active",
		createdAt: Date.now(),
	});
	await ctx.db.insert("auditEvents", {
		tenant,
		at: Date.now(),
		actor: "system:keys",
		action: "key.install",
		entity: "key",
		entityId: String(version),
		summary: "key.install",
	});
	return "installed";
}

export const install = internalMutation({
	args: { tenant: v.string(), version: v.number(), wrapped: encryptedValidator },
	returns: v.union(v.literal("installed"), v.literal("exists")),
	handler: (ctx, args) => installWrappedKey(ctx, args),
});

/** Master key rotation: replaces the wrapped copy of an existing version (the data key is the same). */
export const rewrap = internalMutation({
	args: { tenant: v.string(), version: v.number(), wrapped: encryptedValidator },
	returns: v.union(v.literal("rewrapped"), v.literal("missing")),
	handler: async (ctx, { tenant, version, wrapped }) => {
		const found = await ctx.db
			.query("appKeys")
			.withIndex("by_tenant_version", (q) => q.eq("tenant", tenant).eq("version", version))
			.unique();
		if (found === null) return "missing" as const;
		await ctx.db.patch(found._id, { wrapped });
		await ctx.db.insert("auditEvents", {
			tenant,
			at: Date.now(),
			actor: "system:keys",
			action: "key.rotate",
			entity: "key",
			entityId: String(version),
			summary: "key.rotate",
		});
		return "rewrapped" as const;
	},
});
