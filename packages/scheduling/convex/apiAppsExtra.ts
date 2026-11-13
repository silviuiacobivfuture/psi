import { v } from "convex/values";
import { isPermissionKey } from "../src/permissions/catalogue";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { mutation, type QueryCtx, query } from "./_generated/server";
import { deleteAll, owned, REFUSED, record } from "./apiSupport";
import { logChange } from "./changeLog";
import { requireServer } from "./guard";
import { actorValidator, serverKeyValidator } from "./validators";

/**
 * What the staff API needs of an app and its team that the first wrappers did not give: making and changing an app
 * (the tenant row), a member's profile, a member's whole set of roles and coordinators in ONE write (one audit
 * event), personal overrides replaced as a set, a role renamed, and "which apps is this person in". Same rules as the
 * other wrappers: the server key, the acting subject, ciphertext untouched, one audit event and one change-log entry
 * per write, nothing written by a refusal.
 */
const SLUG = /^[a-z][a-z0-9-]{1,40}$/;
const validZone = (zone: string): boolean => {
	try {
		new Intl.DateTimeFormat("en", { timeZone: zone });
		return true;
	} catch {
		return false;
	}
};
const appView = (t: Doc<"tenants">) => ({
	id: t.slug,
	name: t.name ?? t.slug,
	timeZone: t.timeZone,
	active: t.active,
	createdAt: Math.floor(t._creationTime),
	updatedAt: t.updatedAt ?? Math.floor(t._creationTime),
});
const tenantOf = (ctx: QueryCtx, slug: string) =>
	ctx.db
		.query("tenants")
		.withIndex("by_slug", (q) => q.eq("slug", slug))
		.unique();

export const getApp = query({
	args: { key: serverKeyValidator, tenant: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const t = await tenantOf(ctx, args.tenant);
		return t === null ? REFUSED("not_found") : { ok: true as const, ...appView(t) };
	},
});

/** Brings an app into being: the tenant row, the seed roles and the seed forms (the same as `clinicApps:ensureApp`). */
export const createApp = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		name: v.string(),
		timeZone: v.string(),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const name = args.name.trim();
		if (!SLUG.test(args.tenant) || name === "" || name.length > 200 || !validZone(args.timeZone))
			return REFUSED("invalid");
		if ((await tenantOf(ctx, args.tenant)) !== null) return REFUSED("exists");
		// ensureApp writes the app.create audit event itself (as the setup process).
		await ctx.runMutation(internal.clinicApps.ensureApp, {
			slug: args.tenant,
			name,
			kind: "clinic",
			defaultLocale: "ro",
			currency: "RON",
		});
		const t = await tenantOf(ctx, args.tenant);
		if (t === null) return REFUSED("not_found");
		await ctx.db.patch(t._id, { timeZone: args.timeZone, updatedAt: Date.now() });
		await logChange(ctx, args.tenant, "setting", t._id, 1);
		const made = await tenantOf(ctx, args.tenant);
		return made === null ? REFUSED("not_found") : { ok: true as const, ...appView(made) };
	},
});

export const updateApp = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		name: v.optional(v.string()),
		timeZone: v.optional(v.string()),
		active: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const t = await tenantOf(ctx, args.tenant);
		if (t === null) return REFUSED("not_found");
		const name = args.name?.trim();
		if (
			(name !== undefined && (name === "" || name.length > 200)) ||
			(args.timeZone !== undefined && !validZone(args.timeZone))
		)
			return REFUSED("invalid");
		const fields = [
			...(name !== undefined && name !== t.name ? ["name"] : []),
			...(args.timeZone !== undefined && args.timeZone !== t.timeZone ? ["timeZone"] : []),
			...(args.active !== undefined && args.active !== t.active ? ["active"] : []),
		];
		if (fields.length === 0) return { ok: true as const, changed: false as const, ...appView(t) };
		await ctx.db.patch(t._id, {
			name: name ?? t.name,
			timeZone: args.timeZone ?? t.timeZone,
			active: args.active ?? t.active,
			updatedAt: Date.now(),
		});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "builder.change",
			entity: "app",
			entityId: t._id,
			kind: "setting",
			version: 1,
			fields,
		});
		const after = await tenantOf(ctx, args.tenant);
		return after === null
			? REFUSED("not_found")
			: { ok: true as const, changed: true as const, ...appView(after) };
	},
});

/** Takes back an app nothing was done in (the roll-back of a half-made app): refused, writing nothing, once it holds data. */
export const removeApp = mutation({
	args: { key: serverKeyValidator, tenant: v.string(), actor: actorValidator },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const t = await tenantOf(ctx, args.tenant);
		if (t === null) return REFUSED("not_found");
		const used =
			(await ctx.db
				.query("clients")
				.withIndex("by_tenant_name", (q) => q.eq("tenant", args.tenant))
				.first()) ??
			(await ctx.db
				.query("visits")
				.withIndex("by_tenant_start", (q) => q.eq("tenant", args.tenant))
				.first()) ??
			(await ctx.db
				.query("practitioners")
				.withIndex("by_tenant_slug", (q) => q.eq("tenant", args.tenant))
				.first());
		if (used !== null) return REFUSED("in_use");
		const tenant = args.tenant;
		const rows = [
			await ctx.db
				.query("roleMembers")
				.withIndex("by_tenant_subject", (q) => q.eq("tenant", tenant))
				.collect(),
			await ctx.db
				.query("permissionOverrides")
				.withIndex("by_tenant_subject", (q) => q.eq("tenant", tenant))
				.collect(),
			await ctx.db
				.query("coordinatorAssignments")
				.withIndex("by_tenant_subject", (q) => q.eq("tenant", tenant))
				.collect(),
			await ctx.db
				.query("memberProfiles")
				.withIndex("by_tenant_subject", (q) => q.eq("tenant", tenant))
				.collect(),
			await ctx.db
				.query("roles")
				.withIndex("by_tenant_name", (q) => q.eq("tenant", tenant))
				.collect(),
			await ctx.db
				.query("formDefinitions")
				.withIndex("by_tenant_key_version", (q) => q.eq("tenant", tenant))
				.collect(),
		];
		for (const group of rows) await deleteAll(ctx, group);
		await ctx.db.delete(t._id);
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "builder.change",
			entity: "app",
			entityId: t._id,
			kind: "setting",
			version: 1,
			fields: ["deleted"],
		});
		return { ok: true as const };
	},
});

/** A role renamed, re-described or given another set of keys, in one write (`apiAccess:updateRole` cannot rename). */
export const saveRole = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		role: v.string(),
		name: v.optional(v.string()),
		description: v.optional(v.string()),
		permissions: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "roles", args.tenant, args.role);
		if (row === null) return REFUSED("not_found");
		const name = args.name?.trim();
		if (
			(name !== undefined && (name === "" || name.length > 60)) ||
			(args.permissions !== undefined &&
				!(
					args.permissions.every(isPermissionKey) &&
					new Set(args.permissions).size === args.permissions.length
				))
		)
			return REFUSED("invalid");
		if (name !== undefined && name !== row.name) {
			const same = await ctx.db
				.query("roles")
				.withIndex("by_tenant_name", (q) => q.eq("tenant", args.tenant).eq("name", name))
				.unique();
			if (same !== null) return REFUSED("exists");
		}
		const same = (a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean =>
			a.length === b.length && [...a].sort().join("\n") === [...b].sort().join("\n");
		const fields = [
			...(name !== undefined && name !== row.name ? ["name"] : []),
			...(args.description !== undefined && args.description !== row.description
				? ["description"]
				: []),
			...(args.permissions !== undefined && !same(args.permissions, row.permissions)
				? ["permissions"]
				: []),
		];
		if (fields.length === 0) return { ok: true as const, changed: false as const };
		await ctx.db.patch(row._id, {
			name: name ?? row.name,
			description: args.description ?? row.description,
			permissions: args.permissions ?? row.permissions,
			updatedAt: Date.now(),
			updatedBy: args.actor.subject,
		});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "role.change",
			entity: "role",
			entityId: row._id,
			kind: "role",
			version: 1,
			fields,
		});
		return { ok: true as const, changed: true as const };
	},
});
