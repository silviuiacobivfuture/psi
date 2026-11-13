import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
	auditBatch,
	deviceByLegacy,
	groupByLegacy,
	MAX_BATCH,
	practitionerByLegacy,
	resultValidator,
	roomByLegacy,
	staffByLegacy,
	type UpsertResult,
	upsertRow,
} from "./importSupport";

/**
 * Import of the people and things the calendar's columns are made of: practitioners, devices,
 * rooms, group activities, and staff (reception, volunteers). Internal: reached with the admin key.
 */

const look = {
	color: v.optional(v.string()),
	background: v.optional(v.string()),
	sortOrder: v.optional(v.number()),
};
const base = { legacyId: v.string(), fingerprint: v.string() };

export const upsertPractitioners = internalMutation({
	args: {
		tenant: v.string(),
		rows: v.array(
			v.object({
				...base,
				...look,
				slug: v.string(),
				displayName: v.string(),
				active: v.boolean(),
				shortName: v.optional(v.string()),
				specialty: v.optional(v.string()),
				workDays: v.optional(v.array(v.number())),
				workStartHour: v.optional(v.number()),
				workEndHour: v.optional(v.number()),
			}),
		),
	},
	returns: v.array(resultValidator),
	handler: async (ctx, { tenant, rows }) => {
		if (rows.length > MAX_BATCH) throw new Error("batch too large");
		const out: UpsertResult[] = [];
		const now = Date.now();
		for (const r of rows) {
			const owned = {
				displayName: r.displayName,
				active: r.active,
				shortName: r.shortName,
				specialty: r.specialty,
				color: r.color,
				background: r.background,
				sortOrder: r.sortOrder,
				workDays: r.workDays,
				workStartHour: r.workStartHour,
				workEndHour: r.workEndHour,
				fingerprint: r.fingerprint,
				updatedAt: now,
			};
			out.push(
				await upsertRow({
					legacyId: r.legacyId,
					fingerprint: r.fingerprint,
					find: async () => {
						const f = await practitionerByLegacy(ctx, tenant, r.legacyId);
						return f === null
							? null
							: { id: f._id, fingerprint: f.fingerprint, version: f.version };
					},
					insert: () =>
						ctx.db.insert("practitioners", {
							tenant,
							slug: r.slug,
							legacyId: r.legacyId,
							version: 1,
							...owned,
						}),
					update: async (id, version) => {
						const target = ctx.db.normalizeId("practitioners", id);
						if (target !== null) await ctx.db.patch(target, { ...owned, version });
					},
				}),
			);
		}
		await auditBatch(ctx, tenant, "practitioners", out);
		return out;
	},
});

export const upsertDevices = internalMutation({
	args: {
		tenant: v.string(),
		rows: v.array(
			v.object({
				...base,
				...look,
				slug: v.string(),
				name: v.string(),
				kind: v.union(v.literal("neurofeedback"), v.literal("other")),
				active: v.boolean(),
			}),
		),
	},
	returns: v.array(resultValidator),
	handler: async (ctx, { tenant, rows }) => {
		if (rows.length > MAX_BATCH) throw new Error("batch too large");
		const out: UpsertResult[] = [];
		const now = Date.now();
		for (const r of rows) {
			const owned = {
				name: r.name,
				kind: r.kind,
				active: r.active,
				color: r.color,
				background: r.background,
				sortOrder: r.sortOrder,
				fingerprint: r.fingerprint,
				updatedAt: now,
			};
			out.push(
				await upsertRow({
					legacyId: r.legacyId,
					fingerprint: r.fingerprint,
					find: async () => {
						const f = await deviceByLegacy(ctx, tenant, r.legacyId);
						return f === null
							? null
							: { id: f._id, fingerprint: f.fingerprint, version: f.version };
					},
					insert: () =>
						ctx.db.insert("devices", {
							tenant,
							slug: r.slug,
							legacyId: r.legacyId,
							version: 1,
							...owned,
						}),
					update: async (id, version) => {
						const target = ctx.db.normalizeId("devices", id);
						if (target !== null) await ctx.db.patch(target, { ...owned, version });
					},
				}),
			);
		}
		await auditBatch(ctx, tenant, "devices", out);
		return out;
	},
});

export const upsertRooms = internalMutation({
	args: {
		tenant: v.string(),
		rows: v.array(
			v.object({
				...base,
				...look,
				slug: v.string(),
				name: v.string(),
				kind: v.string(),
				capacity: v.number(),
				active: v.boolean(),
			}),
		),
	},
	returns: v.array(resultValidator),
	handler: async (ctx, { tenant, rows }) => {
		if (rows.length > MAX_BATCH) throw new Error("batch too large");
		const out: UpsertResult[] = [];
		const now = Date.now();
		for (const r of rows) {
			const owned = {
				name: r.name,
				kind: r.kind,
				capacity: r.capacity,
				active: r.active,
				color: r.color,
				background: r.background,
				sortOrder: r.sortOrder,
				fingerprint: r.fingerprint,
				updatedAt: now,
			};
			out.push(
				await upsertRow({
					legacyId: r.legacyId,
					fingerprint: r.fingerprint,
					find: async () => {
						const f = await roomByLegacy(ctx, tenant, r.legacyId);
						return f === null
							? null
							: { id: f._id, fingerprint: f.fingerprint, version: f.version };
					},
					insert: () =>
						ctx.db.insert("rooms", {
							tenant,
							slug: r.slug,
							legacyId: r.legacyId,
							version: 1,
							suits: ["child", "teen", "adult"],
							equipment: [],
							...owned,
						}),
					update: async (id, version) => {
						const target = ctx.db.normalizeId("rooms", id);
						if (target !== null) await ctx.db.patch(target, { ...owned, version });
					},
				}),
			);
		}
		await auditBatch(ctx, tenant, "rooms", out);
		return out;
	},
});

export const upsertGroups = internalMutation({
	args: {
		tenant: v.string(),
		rows: v.array(
			v.object({
				...base,
				...look,
				slug: v.string(),
				name: v.string(),
				shortName: v.optional(v.string()),
				active: v.boolean(),
			}),
		),
	},
	returns: v.array(resultValidator),
	handler: async (ctx, { tenant, rows }) => {
		if (rows.length > MAX_BATCH) throw new Error("batch too large");
		const out: UpsertResult[] = [];
		const now = Date.now();
		for (const r of rows) {
			const owned = {
				name: r.name,
				shortName: r.shortName,
				active: r.active,
				color: r.color,
				background: r.background,
				sortOrder: r.sortOrder,
				fingerprint: r.fingerprint,
				updatedAt: now,
			};
			out.push(
				await upsertRow({
					legacyId: r.legacyId,
					fingerprint: r.fingerprint,
					find: async () => {
						const f = await groupByLegacy(ctx, tenant, r.legacyId);
						return f === null
							? null
							: { id: f._id, fingerprint: f.fingerprint, version: f.version };
					},
					insert: () =>
						ctx.db.insert("groupActivities", {
							tenant,
							slug: r.slug,
							legacyId: r.legacyId,
							version: 1,
							...owned,
						}),
					update: async (id, version) => {
						const target = ctx.db.normalizeId("groupActivities", id);
						if (target !== null) await ctx.db.patch(target, { ...owned, version });
					},
				}),
			);
		}
		await auditBatch(ctx, tenant, "groupActivities", out);
		return out;
	},
});

export const upsertStaff = internalMutation({
	args: {
		tenant: v.string(),
		rows: v.array(
			v.object({
				...base,
				name: v.string(),
				kind: v.union(v.literal("reception"), v.literal("other"), v.literal("volunteer")),
				active: v.boolean(),
			}),
		),
	},
	returns: v.array(resultValidator),
	handler: async (ctx, { tenant, rows }) => {
		if (rows.length > MAX_BATCH) throw new Error("batch too large");
		const out: UpsertResult[] = [];
		const now = Date.now();
		for (const r of rows) {
			const owned = {
				name: r.name,
				kind: r.kind,
				active: r.active,
				fingerprint: r.fingerprint,
				updatedAt: now,
			};
			out.push(
				await upsertRow({
					legacyId: r.legacyId,
					fingerprint: r.fingerprint,
					find: async () => {
						const f = await staffByLegacy(ctx, tenant, r.legacyId);
						return f === null
							? null
							: { id: f._id, fingerprint: f.fingerprint, version: f.version };
					},
					insert: () =>
						ctx.db.insert("staffMembers", { tenant, legacyId: r.legacyId, version: 1, ...owned }),
					update: async (id, version) => {
						const target = ctx.db.normalizeId("staffMembers", id);
						if (target !== null) await ctx.db.patch(target, { ...owned, version });
					},
				}),
			);
		}
		await auditBatch(ctx, tenant, "staffMembers", out);
		return out;
	},
});
