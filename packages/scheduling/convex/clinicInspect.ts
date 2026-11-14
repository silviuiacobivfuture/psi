import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { CLINIC_TABLES, rowsOf } from "./clinicTables";

/**
 * Row counts of an app's clinic tables: what a restore drill compares (before and after) and what
 * the tests assert did not change. Counts only, never content. Internal: admin key. A table is
 * counted up to 20,000 rows (far beyond the clinic's).
 */
export const counts = internalQuery({
	args: { tenant: v.string() },
	returns: v.record(v.string(), v.number()),
	handler: async (ctx, { tenant }) => {
		const out: Record<string, number> = {};
		for (const table of CLINIC_TABLES) out[table] = (await rowsOf(ctx, tenant, table)).length;
		return out;
	},
});

/**
 * The old ids of an app's imported rows in one table, with the fingerprint each was written with: what the
 * old-app sync compares the old app's rows with, to say what would be created, changed or is gone from the
 * old app. Reads only; ids and fingerprints (a keyed hash), never content. Internal: admin key.
 */
export const stored = internalQuery({
	args: {
		tenant: v.string(),
		table: v.union(
			v.literal("practitioners"),
			v.literal("devices"),
			v.literal("rooms"),
			v.literal("groupActivities"),
			v.literal("staffMembers"),
			v.literal("clients"),
			v.literal("packages"),
			v.literal("visits"),
			v.literal("payments"),
			v.literal("rosterDays"),
			v.literal("staffBlocks"),
			v.literal("formResponses"),
			v.literal("files"),
		),
	},
	returns: v.array(v.object({ legacyId: v.string(), fingerprint: v.optional(v.string()) })),
	handler: async (ctx, { tenant, table }) =>
		(await rowsOf(ctx, tenant, table)).flatMap((row) => {
			if (!("legacyId" in row) || typeof row.legacyId !== "string") return [];
			return [
				{
					legacyId: row.legacyId,
					...("fingerprint" in row && typeof row.fingerprint === "string"
						? { fingerprint: row.fingerprint }
						: {}),
				},
			];
		}),
});

/**
 * The slugs already taken by an app's practitioners, rooms, devices and group activities, with the
 * old id when the row came from the import: what the import checks before writing, so a row from
 * the old app can never take the place of one the web flow already has.
 */
export const slugs = internalQuery({
	args: { tenant: v.string() },
	returns: v.array(
		v.object({
			kind: v.union(
				v.literal("practitioners"),
				v.literal("rooms"),
				v.literal("devices"),
				v.literal("groups"),
			),
			slug: v.string(),
			legacyId: v.optional(v.string()),
		}),
	),
	handler: async (ctx, { tenant }) => {
		const slugRow = (row: { slug: string; legacyId?: string }) => ({
			slug: row.slug,
			...(row.legacyId === undefined ? {} : { legacyId: row.legacyId }),
		});
		const practitioners = await ctx.db
			.query("practitioners")
			.withIndex("by_tenant_slug", (q) => q.eq("tenant", tenant))
			.collect();
		const rooms = await ctx.db
			.query("rooms")
			.withIndex("by_tenant_slug", (q) => q.eq("tenant", tenant))
			.collect();
		const devices = await ctx.db
			.query("devices")
			.withIndex("by_tenant_slug", (q) => q.eq("tenant", tenant))
			.collect();
		const groups = await ctx.db
			.query("groupActivities")
			.withIndex("by_tenant_slug", (q) => q.eq("tenant", tenant))
			.collect();
		return [
			...practitioners.map((r) => ({ kind: "practitioners" as const, ...slugRow(r) })),
			...rooms.map((r) => ({ kind: "rooms" as const, ...slugRow(r) })),
			...devices.map((r) => ({ kind: "devices" as const, ...slugRow(r) })),
			...groups.map((r) => ({ kind: "groups" as const, ...slugRow(r) })),
		];
	},
});
