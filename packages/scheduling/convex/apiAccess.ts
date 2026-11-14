import { v } from "convex/values";
import { isPermissionKey } from "../src/permissions/catalogue";
import { MAX_INCLUDE_DEPTH } from "../src/permissions/composed";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { owned, REFUSED, record } from "./apiSupport";
import { CATALOG_MAX, TOO_MANY_ROWS } from "./bounded";
import { requireServer } from "./guard";
import { appRoles, composedOf, composedRoles, includesOf } from "./roleIncludes";
import { practitionerOf } from "./setupSupport";
import { actorValidator, serverKeyValidator } from "./validators";

/**
 * Roles, members, personal overrides and coordinator assignments for the staff API: data per app,
 * edited by owners, applied at once. The catalogue (code) decides which keys exist; a role holds
 * only keys it defines. Deny overrides win (`effectivePermissions`).
 */
const keysOk = (keys: ReadonlyArray<string>): boolean =>
	keys.every(isPermissionKey) && new Set(keys).size === keys.length;

export const createRole = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		name: v.string(),
		description: v.string(),
		permissions: v.array(v.string()),
		includes: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const name = args.name.trim();
		const includes = await includesOf(ctx, args.tenant, undefined, args.includes ?? []);
		if (includes === undefined) return REFUSED("invalid");
		if (name === "" || name.length > 60 || !keysOk(args.permissions)) return REFUSED("invalid");
		const same = await ctx.db
			.query("roles")
			.withIndex("by_tenant_name", (q) => q.eq("tenant", args.tenant).eq("name", name))
			.unique();
		if (same !== null) return REFUSED("exists");
		const id = await ctx.db.insert("roles", {
			tenant: args.tenant,
			name,
			description: args.description,
			permissions: args.permissions,
			...(includes.length === 0 ? {} : { includes }),
			seeded: false,
			updatedAt: Date.now(),
			updatedBy: args.actor.subject,
		});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "role.change",
			entity: "role",
			entityId: id,
			kind: "role",
			version: 1,
		});
		return { ok: true as const, id };
	},
});

export const updateRole = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		role: v.string(),
		description: v.optional(v.string()),
		permissions: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "roles", args.tenant, args.role);
		if (row === null) return REFUSED("not_found");
		if (args.permissions !== undefined && !keysOk(args.permissions)) return REFUSED("invalid");
		await ctx.db.patch(row._id, {
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
			fields: [
				...(args.description === undefined ? [] : ["description"]),
				...(args.permissions === undefined ? [] : ["permissions"]),
			],
		});
		return { ok: true as const };
	},
});

/** A role goes only when nobody holds it and no other role includes it. */
export const deleteRole = mutation({
	args: { key: serverKeyValidator, tenant: v.string(), actor: actorValidator, role: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "roles", args.tenant, args.role);
		if (row === null) return REFUSED("not_found");
		const held = await ctx.db
			.query("roleMembers")
			.withIndex("by_tenant_role", (q) => q.eq("tenant", args.tenant).eq("role", row._id))
			.first();
		if (held !== null) return REFUSED("in_use");
		const roles = await composedRoles(ctx, args.tenant);
		if ([...roles.values()].some((r) => r.includes.includes(row._id))) return REFUSED("included");
		await ctx.db.delete(row._id);
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "role.change",
			entity: "role",
			entityId: row._id,
			kind: "role",
			version: 1,
			fields: ["deleted"],
		});
		return { ok: true as const };
	},
});

export const assignRole = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		subject: v.string(),
		role: v.string(),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const role = await owned(ctx, "roles", args.tenant, args.role);
		if (role === null || args.subject.trim() === "")
			return REFUSED(role === null ? "not_found" : "invalid");
		const held = (
			await ctx.db
				.query("roleMembers")
				.withIndex("by_tenant_subject", (q) =>
					q.eq("tenant", args.tenant).eq("subject", args.subject),
				)
				.collect()
		).find((m) => m.role === role._id);
		if (held !== undefined) return { ok: true as const, changed: false as const };
		const id = await ctx.db.insert("roleMembers", {
			tenant: args.tenant,
			subject: args.subject,
			role: role._id,
			createdAt: Date.now(),
		});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "member.change",
			entity: "member",
			entityId: id,
			kind: "member",
			version: 1,
			fields: ["role"],
		});
		return { ok: true as const, changed: true as const };
	},
});

export const unassignRole = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		subject: v.string(),
		role: v.string(),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const role = await owned(ctx, "roles", args.tenant, args.role);
		if (role === null) return REFUSED("not_found");
		const held = (
			await ctx.db
				.query("roleMembers")
				.withIndex("by_tenant_subject", (q) =>
					q.eq("tenant", args.tenant).eq("subject", args.subject),
				)
				.collect()
		).find((m) => m.role === role._id);
		if (held === undefined) return { ok: true as const, changed: false as const };
		await ctx.db.delete(held._id);
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "member.change",
			entity: "member",
			entityId: held._id,
			kind: "member",
			version: 1,
			fields: ["role"],
		});
		return { ok: true as const, changed: true as const };
	},
});

/** A personal grant or deny on top of roles (replaces the person's earlier entry for that key). */
export const setOverride = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		subject: v.string(),
		permission: v.string(),
		effect: v.union(v.literal("grant"), v.literal("deny")),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (!isPermissionKey(args.permission) || args.subject.trim() === "") return REFUSED("invalid");
		const existing = (
			await ctx.db
				.query("permissionOverrides")
				.withIndex("by_tenant_subject", (q) =>
					q.eq("tenant", args.tenant).eq("subject", args.subject),
				)
				.collect()
		).find((o) => o.permission === args.permission);
		let id: Id<"permissionOverrides">;
		if (existing === undefined) {
			id = await ctx.db.insert("permissionOverrides", {
				tenant: args.tenant,
				subject: args.subject,
				permission: args.permission,
				effect: args.effect,
				updatedAt: Date.now(),
				updatedBy: args.actor.subject,
			});
		} else {
			id = existing._id;
			await ctx.db.patch(id, {
				effect: args.effect,
				updatedAt: Date.now(),
				updatedBy: args.actor.subject,
			});
		}
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "override.change",
			entity: "override",
			entityId: id,
			kind: "override",
			version: 1,
			fields: ["effect"],
		});
		return { ok: true as const, id };
	},
});

export const removeOverride = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		subject: v.string(),
		permission: v.string(),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const existing = (
			await ctx.db
				.query("permissionOverrides")
				.withIndex("by_tenant_subject", (q) =>
					q.eq("tenant", args.tenant).eq("subject", args.subject),
				)
				.collect()
		).find((o) => o.permission === args.permission);
		if (existing === undefined) return REFUSED("not_found");
		await ctx.db.delete(existing._id);
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "override.change",
			entity: "override",
			entityId: existing._id,
			kind: "override",
			version: 1,
			fields: ["deleted"],
		});
		return { ok: true as const };
	},
});

/** Assigns (or releases) a coordinator to a practitioner: the `assigned_to` relation. */
export const setCoordinator = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		subject: v.string(),
		practitioner: v.string(),
		assigned: v.boolean(),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const p = await practitionerOf(ctx, args.tenant, args.practitioner);
		if (p === undefined || args.subject.trim() === "")
			return REFUSED(p === undefined ? "unknown_practitioner" : "invalid");
		const existing = (
			await ctx.db
				.query("coordinatorAssignments")
				.withIndex("by_tenant_subject", (q) =>
					q.eq("tenant", args.tenant).eq("subject", args.subject),
				)
				.collect()
		).find((a) => a.practitioner === p._id);
		if (args.assigned === (existing !== undefined))
			return { ok: true as const, changed: false as const };
		let id: Id<"coordinatorAssignments"> | undefined;
		if (args.assigned)
			id = await ctx.db.insert("coordinatorAssignments", {
				tenant: args.tenant,
				subject: args.subject,
				practitioner: p._id,
				createdAt: Date.now(),
			});
		else if (existing !== undefined) {
			id = existing._id;
			await ctx.db.delete(id);
		}
		if (id !== undefined)
			await record(ctx, {
				tenant: args.tenant,
				actor: args.actor.subject,
				action: "member.change",
				entity: "member",
				entityId: id,
				kind: "member",
				version: 1,
				fields: ["assigned_to"],
			});
		return { ok: true as const, changed: true as const };
	},
});

export const roles = query({
	args: { key: serverKeyValidator, tenant: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const rows = await ctx.db
			.query("roles")
			.withIndex("by_tenant_name", (q) => q.eq("tenant", args.tenant))
			.take(CATALOG_MAX + 1);
		if (rows.length > CATALOG_MAX) return REFUSED(TOO_MANY_ROWS);
		const members = await ctx.db
			.query("roleMembers")
			.withIndex("by_tenant_role", (q) => q.eq("tenant", args.tenant))
			.take(CATALOG_MAX + 1);
		if (members.length > CATALOG_MAX) return REFUSED(TOO_MANY_ROWS);
		return {
			ok: true as const,
			roles: rows.map((r) => ({
				...r,
				id: r._id,
				members: members.filter((m) => m.role === r._id).map((m) => m.subject),
			})),
		};
	},
});

/** Everything the API needs to decide for one person: roles, overrides, coordinated and own practitioners. */
export const forSubject = query({
	args: { key: serverKeyValidator, tenant: v.string(), subject: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const members = await ctx.db
			.query("roleMembers")
			.withIndex("by_tenant_subject", (q) =>
				q.eq("tenant", args.tenant).eq("subject", args.subject),
			)
			.collect();
		// Every role held, and every role those include (transitively): what the person holds through each.
		const rows = await appRoles(ctx, args.tenant);
		const all = composedOf(rows);
		const names = new Map(rows.map((r) => [r._id as string, r.name]));
		const reached = new Set<string>();
		const reach = (id: string, depth: number): void => {
			if (reached.has(id) || depth > MAX_INCLUDE_DEPTH) return;
			reached.add(id);
			for (const inc of all.get(id)?.includes ?? []) reach(inc, depth + 1);
		};
		for (const m of members) reach(m.role, 0);
		const roles = [...reached].flatMap((id) => {
			const r = all.get(id);
			return r === undefined
				? []
				: [{ name: names.get(id) ?? id, permissions: [...r.permissions] }];
		});
		const overrides = await ctx.db
			.query("permissionOverrides")
			.withIndex("by_tenant_subject", (q) =>
				q.eq("tenant", args.tenant).eq("subject", args.subject),
			)
			.collect();
		const assigned = await ctx.db
			.query("coordinatorAssignments")
			.withIndex("by_tenant_subject", (q) =>
				q.eq("tenant", args.tenant).eq("subject", args.subject),
			)
			.collect();
		const own = await ctx.db
			.query("practitioners")
			.withIndex("by_tenant_subject", (q) =>
				q.eq("tenant", args.tenant).eq("staffSubject", args.subject),
			)
			.first();
		return {
			ok: true as const,
			roles,
			overrides: overrides.map((o) => ({ permission: o.permission, effect: o.effect })),
			assignedPractitioners: assigned.map((a) => a.practitioner as string),
			practitioner: own === null ? undefined : (own._id as string),
		};
	},
});
