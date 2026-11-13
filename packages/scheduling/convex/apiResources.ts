import { v } from "convex/values";
import { planChange } from "../src/clinic/change";
import { mutation, query } from "./_generated/server";
import { owned, REFUSED, record } from "./apiSupport";
import { requireServer } from "./guard";
import { SLUG } from "./setupSupport";
import { actorValidator, serverKeyValidator } from "./validators";

/**
 * Devices, group activities and staff members for the staff API. They are different things from
 * practitioners and from rooms (which have their own functions in `staffRooms`): a device or a
 * group activity can never be offered as a person. Nothing here is deleted; deactivate instead.
 */
const look = {
	color: v.optional(v.string()),
	background: v.optional(v.string()),
	sortOrder: v.optional(v.number()),
};

export const createDevice = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		slug: v.string(),
		name: v.string(),
		kind: v.union(v.literal("neurofeedback"), v.literal("other")),
		...look,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (!SLUG.test(args.slug) || args.name.trim() === "") return REFUSED("invalid");
		const same = await ctx.db
			.query("devices")
			.withIndex("by_tenant_slug", (q) => q.eq("tenant", args.tenant).eq("slug", args.slug))
			.first();
		if (same !== null) return REFUSED("exists");
		const id = await ctx.db.insert("devices", {
			tenant: args.tenant,
			slug: args.slug,
			name: args.name.trim(),
			kind: args.kind,
			active: true,
			color: args.color,
			background: args.background,
			sortOrder: args.sortOrder,
			version: 1,
			updatedAt: Date.now(),
		});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "builder.change",
			entity: "builder",
			entityId: id,
			kind: "device",
			version: 1,
			fields: ["device"],
		});
		return { ok: true as const, id };
	},
});

export const updateDevice = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		device: v.string(),
		patch: v.object({
			name: v.optional(v.string()),
			active: v.optional(v.boolean()),
			color: v.optional(v.string()),
			background: v.optional(v.string()),
			sortOrder: v.optional(v.number()),
		}),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "devices", args.tenant, args.device);
		if (row === null) return REFUSED("not_found");
		if (args.patch.name !== undefined && args.patch.name.trim() === "") return REFUSED("invalid");
		const change = planChange(row, args.patch);
		if (!change.changed) return { ok: true as const, changed: false as const };
		await ctx.db.patch(row._id, {
			...args.patch,
			version: change.nextVersion,
			updatedAt: Date.now(),
		});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "builder.change",
			entity: "builder",
			entityId: row._id,
			kind: "device",
			version: change.nextVersion,
			fields: change.fields,
		});
		return { ok: true as const, changed: true as const };
	},
});

export const devices = query({
	args: { key: serverKeyValidator, tenant: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const rows = await ctx.db
			.query("devices")
			.withIndex("by_tenant_slug", (q) => q.eq("tenant", args.tenant))
			.collect();
		return { ok: true as const, devices: rows.map((d) => ({ ...d, id: d._id })) };
	},
});

export const createGroup = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		slug: v.string(),
		name: v.string(),
		shortName: v.optional(v.string()),
		...look,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (!SLUG.test(args.slug) || args.name.trim() === "") return REFUSED("invalid");
		const same = await ctx.db
			.query("groupActivities")
			.withIndex("by_tenant_slug", (q) => q.eq("tenant", args.tenant).eq("slug", args.slug))
			.first();
		if (same !== null) return REFUSED("exists");
		const id = await ctx.db.insert("groupActivities", {
			tenant: args.tenant,
			slug: args.slug,
			name: args.name.trim(),
			shortName: args.shortName,
			active: true,
			color: args.color,
			background: args.background,
			sortOrder: args.sortOrder,
			version: 1,
			updatedAt: Date.now(),
		});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "builder.change",
			entity: "builder",
			entityId: id,
			kind: "group",
			version: 1,
			fields: ["group"],
		});
		return { ok: true as const, id };
	},
});

export const updateGroup = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		group: v.string(),
		patch: v.object({
			name: v.optional(v.string()),
			shortName: v.optional(v.string()),
			active: v.optional(v.boolean()),
			color: v.optional(v.string()),
			background: v.optional(v.string()),
			sortOrder: v.optional(v.number()),
		}),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "groupActivities", args.tenant, args.group);
		if (row === null) return REFUSED("not_found");
		if (args.patch.name !== undefined && args.patch.name.trim() === "") return REFUSED("invalid");
		const change = planChange(row, args.patch);
		if (!change.changed) return { ok: true as const, changed: false as const };
		await ctx.db.patch(row._id, {
			...args.patch,
			version: change.nextVersion,
			updatedAt: Date.now(),
		});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "builder.change",
			entity: "builder",
			entityId: row._id,
			kind: "group",
			version: change.nextVersion,
			fields: change.fields,
		});
		return { ok: true as const, changed: true as const };
	},
});

export const groups = query({
	args: { key: serverKeyValidator, tenant: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const rows = await ctx.db
			.query("groupActivities")
			.withIndex("by_tenant_slug", (q) => q.eq("tenant", args.tenant))
			.collect();
		return { ok: true as const, groups: rows.map((g) => ({ ...g, id: g._id })) };
	},
});

/** Reception, other roster-only people, volunteers: on the roster, never bookable. */
export const createStaff = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		name: v.string(),
		kind: v.union(v.literal("reception"), v.literal("other"), v.literal("volunteer")),
		subject: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (args.name.trim() === "") return REFUSED("invalid");
		const id = await ctx.db.insert("staffMembers", {
			tenant: args.tenant,
			name: args.name.trim(),
			kind: args.kind,
			active: true,
			subject: args.subject,
			version: 1,
			updatedAt: Date.now(),
		});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "member.change",
			entity: "member",
			entityId: id,
			kind: "person",
			version: 1,
			fields: ["staff"],
		});
		return { ok: true as const, id };
	},
});

export const updateStaff = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		staff: v.string(),
		patch: v.object({
			name: v.optional(v.string()),
			active: v.optional(v.boolean()),
			subject: v.optional(v.string()),
		}),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "staffMembers", args.tenant, args.staff);
		if (row === null) return REFUSED("not_found");
		if (args.patch.name !== undefined && args.patch.name.trim() === "") return REFUSED("invalid");
		const change = planChange(row, args.patch);
		if (!change.changed) return { ok: true as const, changed: false as const };
		await ctx.db.patch(row._id, {
			...args.patch,
			version: change.nextVersion,
			updatedAt: Date.now(),
		});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "member.change",
			entity: "member",
			entityId: row._id,
			kind: "person",
			version: change.nextVersion,
			fields: change.fields,
		});
		return { ok: true as const, changed: true as const };
	},
});

export const staff = query({
	args: { key: serverKeyValidator, tenant: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const rows = await ctx.db
			.query("staffMembers")
			.withIndex("by_tenant_legacy", (q) => q.eq("tenant", args.tenant))
			.collect();
		return { ok: true as const, staff: rows.map((s) => ({ ...s, id: s._id })) };
	},
});
