import { v } from "convex/values";
import { isPermissionKey } from "../src/permissions/catalogue";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type QueryCtx, query } from "./_generated/server";
import { deleteAll, owned, REFUSED, record } from "./apiSupport";
import { requireServer } from "./guard";
import { practitionerOf } from "./setupSupport";
import { actorValidator, serverKeyValidator } from "./validators";

/**
 * An app's team for the staff API: a member's profile, a member's whole set of roles and coordinators in ONE write (one
 * audit event), personal overrides replaced as a set, and "which apps is this person in". Same rules as the other
 * wrappers: the server key, the acting subject, ciphertext untouched, one audit event and one change-log entry per
 * write, nothing written by a refusal.
 */
async function memberOf(ctx: QueryCtx, tenant: string, subject: string) {
	return ctx.db
		.query("memberProfiles")
		.withIndex("by_tenant_subject", (q) => q.eq("tenant", tenant).eq("subject", subject))
		.unique();
}

/** The rows that hang off one subject in an app. */
async function heldBy(ctx: QueryCtx, tenant: string, subject: string) {
	const roles = await ctx.db
		.query("roleMembers")
		.withIndex("by_tenant_subject", (q) => q.eq("tenant", tenant).eq("subject", subject))
		.collect();
	const overrides = await ctx.db
		.query("permissionOverrides")
		.withIndex("by_tenant_subject", (q) => q.eq("tenant", tenant).eq("subject", subject))
		.collect();
	const coordinated = await ctx.db
		.query("coordinatorAssignments")
		.withIndex("by_tenant_subject", (q) => q.eq("tenant", tenant).eq("subject", subject))
		.collect();
	return { roles, overrides, coordinated };
}

/** One member in the shape the API needs. Roles and coordinated practitioners are Convex ids. */
async function memberView(ctx: QueryCtx, tenant: string, profile: Doc<"memberProfiles">) {
	const held = await heldBy(ctx, tenant, profile.subject);
	return {
		subject: profile.subject,
		displayName: profile.displayName,
		email: profile.email,
		roles: held.roles.map((m) => m.role as string),
		coordinates: held.coordinated.map((a) => a.practitioner as string),
		grants: held.overrides.filter((o) => o.effect === "grant").map((o) => o.permission),
		denies: held.overrides.filter((o) => o.effect === "deny").map((o) => o.permission),
		createdAt: profile.createdAt,
		updatedAt: profile.updatedAt,
	};
}

export const members = query({
	args: { key: serverKeyValidator, tenant: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const profiles = await ctx.db
			.query("memberProfiles")
			.withIndex("by_tenant_subject", (q) => q.eq("tenant", args.tenant))
			.collect();
		const out = [];
		for (const p of profiles) out.push(await memberView(ctx, args.tenant, p));
		return { ok: true as const, members: out };
	},
});

export const member = query({
	args: { key: serverKeyValidator, tenant: v.string(), subject: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const p = await memberOf(ctx, args.tenant, args.subject);
		return p === null
			? REFUSED("not_found")
			: { ok: true as const, member: await memberView(ctx, args.tenant, p) };
	},
});

/** The apps a person is a member of, with the ids of the roles they hold there. */
export const appsOf = query({
	args: { key: serverKeyValidator, subject: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const profiles = await ctx.db
			.query("memberProfiles")
			.withIndex("by_subject", (q) => q.eq("subject", args.subject))
			.collect();
		const apps = [];
		for (const p of profiles) {
			const held = await ctx.db
				.query("roleMembers")
				.withIndex("by_tenant_subject", (q) => q.eq("tenant", p.tenant).eq("subject", args.subject))
				.collect();
			apps.push({ app: p.tenant, roles: held.map((m) => m.role as string) });
		}
		return { ok: true as const, apps };
	},
});

/**
 * Adds a member or changes one: profile, the whole set of roles, the whole set of coordinated practitioners, in one
 * write with one audit event. Nothing changes (and nothing is audited) when it already is as asked.
 */
export const putMember = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		subject: v.string(),
		displayName: v.string(),
		email: v.optional(v.string()),
		roles: v.array(v.string()),
		coordinators: v.array(v.string()),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const name = args.displayName.trim();
		if (args.subject.trim() === "" || args.subject.length > 200 || name === "" || name.length > 200)
			return REFUSED("invalid");
		const roles: Id<"roles">[] = [];
		for (const r of new Set(args.roles)) {
			const row = await owned(ctx, "roles", args.tenant, r);
			if (row === null) return REFUSED("unknown_role");
			roles.push(row._id);
		}
		const coordinated: Id<"practitioners">[] = [];
		for (const p of new Set(args.coordinators)) {
			const row = await practitionerOf(ctx, args.tenant, p);
			if (row === undefined) return REFUSED("unknown_practitioner");
			coordinated.push(row._id);
		}
		const now = Date.now();
		const existing = await memberOf(ctx, args.tenant, args.subject);
		const heldRoles = await ctx.db
			.query("roleMembers")
			.withIndex("by_tenant_subject", (q) =>
				q.eq("tenant", args.tenant).eq("subject", args.subject),
			)
			.collect();
		const heldCoordinators = await ctx.db
			.query("coordinatorAssignments")
			.withIndex("by_tenant_subject", (q) =>
				q.eq("tenant", args.tenant).eq("subject", args.subject),
			)
			.collect();
		const sameSet = (a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean =>
			a.length === b.length && a.every((x) => b.includes(x));
		const fields = [
			...(existing === null || existing.displayName !== name ? ["displayName"] : []),
			...((existing?.email ?? undefined) !== args.email ? ["email"] : []),
			...(sameSet(
				roles,
				heldRoles.map((m) => m.role),
			)
				? []
				: ["roles"]),
			...(sameSet(
				coordinated,
				heldCoordinators.map((a) => a.practitioner),
			)
				? []
				: ["coordinates"]),
		];
		if (existing !== null && fields.length === 0)
			return { ok: true as const, changed: false as const, created: false as const };
		let id: Id<"memberProfiles">;
		if (existing === null) {
			id = await ctx.db.insert("memberProfiles", {
				tenant: args.tenant,
				subject: args.subject,
				displayName: name,
				email: args.email,
				createdAt: now,
				updatedAt: now,
			});
		} else {
			id = existing._id;
			await ctx.db.patch(id, { displayName: name, email: args.email, updatedAt: now });
		}
		for (const m of heldRoles) if (!roles.includes(m.role)) await ctx.db.delete(m._id);
		for (const r of roles)
			if (!heldRoles.some((m) => m.role === r))
				await ctx.db.insert("roleMembers", {
					tenant: args.tenant,
					subject: args.subject,
					role: r,
					createdAt: now,
				});
		for (const a of heldCoordinators)
			if (!coordinated.includes(a.practitioner)) await ctx.db.delete(a._id);
		for (const p of coordinated)
			if (!heldCoordinators.some((a) => a.practitioner === p))
				await ctx.db.insert("coordinatorAssignments", {
					tenant: args.tenant,
					subject: args.subject,
					practitioner: p,
					createdAt: now,
				});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "member.change",
			entity: "member",
			entityId: id,
			kind: "member",
			version: 1,
			fields,
		});
		return { ok: true as const, changed: true as const, created: existing === null };
	},
});

/** Personal grants and denials replaced as a set (a key in both is refused). One audit event; none when unchanged. */
export const setOverrides = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		subject: v.string(),
		grants: v.array(v.string()),
		denies: v.array(v.string()),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const grants = [...new Set(args.grants)];
		const denies = [...new Set(args.denies)];
		if (
			!grants.every(isPermissionKey) ||
			!denies.every(isPermissionKey) ||
			grants.some((g) => denies.includes(g))
		)
			return REFUSED("invalid");
		const profile = await memberOf(ctx, args.tenant, args.subject);
		if (profile === null) return REFUSED("not_found");
		const held = await ctx.db
			.query("permissionOverrides")
			.withIndex("by_tenant_subject", (q) =>
				q.eq("tenant", args.tenant).eq("subject", args.subject),
			)
			.collect();
		const wanted = new Map<string, "grant" | "deny">([
			...grants.map((g): [string, "grant" | "deny"] => [g, "grant"]),
			...denies.map((d): [string, "grant" | "deny"] => [d, "deny"]),
		]);
		const unchanged =
			held.length === wanted.size && held.every((o) => wanted.get(o.permission) === o.effect);
		if (unchanged) return { ok: true as const, changed: false as const };
		const now = Date.now();
		for (const o of held) if (wanted.get(o.permission) !== o.effect) await ctx.db.delete(o._id);
		for (const [permission, effect] of wanted)
			if (!held.some((o) => o.permission === permission && o.effect === effect))
				await ctx.db.insert("permissionOverrides", {
					tenant: args.tenant,
					subject: args.subject,
					permission,
					effect,
					updatedAt: now,
					updatedBy: args.actor.subject,
				});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "override.change",
			entity: "override",
			entityId: profile._id,
			kind: "override",
			version: 1,
			fields: ["grants", "denies"],
		});
		return { ok: true as const, changed: true as const };
	},
});

/** A member and everything that hangs off their subject in the app: profile, roles, overrides, coordinator links. */
export const removeMember = mutation({
	args: { key: serverKeyValidator, tenant: v.string(), actor: actorValidator, subject: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const profile = await memberOf(ctx, args.tenant, args.subject);
		if (profile === null) return REFUSED("not_found");
		const held = await heldBy(ctx, args.tenant, args.subject);
		await deleteAll(ctx, held.roles);
		await deleteAll(ctx, held.overrides);
		await deleteAll(ctx, held.coordinated);
		await ctx.db.delete(profile._id);
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "member.change",
			entity: "member",
			entityId: profile._id,
			kind: "member",
			version: 1,
			fields: ["deleted"],
		});
		return { ok: true as const };
	},
});
