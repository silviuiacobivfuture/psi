import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
	auditBatch,
	clientRef,
	MAX_BATCH,
	refused,
	resultValidator,
	type UpsertResult,
} from "./importSupport";
import { blacklistCategoryValidator, blacklistSeverityValidator } from "./tables/clinicBlacklist";

/**
 * Blacklist entries seeded from a file at import, keyed on the entry's `key` (the result's
 * `legacyId` is that key). An entry the file already created is NEVER rewritten: staff may have
 * switched it off or changed its severity since, and a re-run must not undo their decision. The
 * file's identifiers arrive already normalised (the importer validated them).
 */
export const upsertEntries = internalMutation({
	args: {
		tenant: v.string(),
		rows: v.array(
			v.object({
				legacyId: v.string(),
				clientLegacy: v.optional(v.string()),
				phone: v.optional(v.string()),
				email: v.optional(v.string()),
				name: v.optional(v.string()),
				reason: v.string(),
				category: blacklistCategoryValidator,
				severity: blacklistSeverityValidator,
				expiresAt: v.optional(v.number()),
			}),
		),
	},
	returns: v.array(resultValidator),
	handler: async (ctx, { tenant, rows }) => {
		if (rows.length > MAX_BATCH) throw new Error("batch too large");
		const out: UpsertResult[] = [];
		const now = Date.now();
		for (const r of rows) {
			const present = await ctx.db
				.query("blacklistEntries")
				.withIndex("by_tenant_seed", (q) => q.eq("tenant", tenant).eq("seedKey", r.legacyId))
				.unique();
			if (present !== null) {
				out.push({ legacyId: r.legacyId, id: present._id, outcome: "unchanged" });
				continue;
			}
			const found = await clientRef(ctx, tenant, r.clientLegacy);
			if (!found.ok) {
				out.push(refused(r.legacyId, found.flag));
				continue;
			}
			const id = await ctx.db.insert("blacklistEntries", {
				tenant,
				...(found.client === undefined ? {} : { client: found.client._id }),
				...(r.phone === undefined ? {} : { phone: r.phone }),
				...(r.email === undefined ? {} : { email: r.email }),
				...(r.name === undefined ? {} : { name: r.name }),
				reason: r.reason,
				category: r.category,
				severity: r.severity,
				active: true,
				...(r.expiresAt === undefined ? {} : { expiresAt: r.expiresAt }),
				createdBy: "system:import",
				createdAt: now,
				updatedBy: "system:import",
				updatedAt: now,
				seedKey: r.legacyId,
				version: 1,
			});
			out.push({ legacyId: r.legacyId, id, version: 1, outcome: "created" });
		}
		await auditBatch(ctx, tenant, "blacklistEntries", out);
		return out;
	},
});
