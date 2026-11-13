import { v } from "convex/values";
import { RECOVERY_DAYS } from "../src/clinic/clients";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { logChange } from "./changeLog";
import { eraseClinicData } from "./clinicErase";

/**
 * The clinic's own erasure job (docs/plans/clinic.md section 6), separate from `retention.ts`
 * (which sweeps only the public booking flow's `appointments`). It erases ONE thing: a client
 * soft-deleted more than 30 days ago, with what hangs on them. Clinical history is never erased
 * by age: that period is the owner's decision under the medical-record law.
 */
const BATCH = 20;
const DAY_MS = 86_400_000;

export const eraseDue = internalMutation({
	args: { now: v.number(), tenant: v.optional(v.string()) },
	returns: v.object({ erased: v.number(), more: v.boolean() }),
	handler: async (ctx, { now, tenant: only }) => {
		const cutoff = now - RECOVERY_DAYS * DAY_MS;
		const all = await ctx.db.query("tenants").collect();
		const tenants = only === undefined ? all : all.filter((t) => t.slug === only);
		let erased = 0;
		for (const tenant of tenants) {
			// A visit soft-deleted more than 30 days ago goes for good (its audit trail stays).
			const gone = await ctx.db
				.query("visits")
				.withIndex("by_tenant_deleted", (q) =>
					q.eq("tenant", tenant.slug).gt("deletedAt", 0).lte("deletedAt", cutoff),
				)
				.take(BATCH);
			for (const visit of gone) {
				await ctx.db.delete(visit._id);
				await logChange(ctx, tenant.slug, "visit", visit._id, visit.version + 1);
			}
			if (erased >= BATCH) return { erased, more: true };
			const due = await ctx.db
				.query("clients")
				.withIndex("by_tenant_deleted", (q) =>
					q.eq("tenant", tenant.slug).gt("deletedAt", 0).lte("deletedAt", cutoff),
				)
				.filter((q) => q.eq(q.field("erasedAt"), undefined))
				.take(BATCH - erased);
			for (const client of due) {
				await eraseClinicData(ctx, tenant.slug, client._id, now);
				await ctx.db.insert("auditEvents", {
					tenant: tenant.slug,
					at: now,
					actor: "system:retention",
					action: "client.erase",
					entity: "client",
					entityId: client._id,
					summary: "client.erase",
				});
				await logChange(ctx, tenant.slug, "client", client._id, (client.version ?? 0) + 1);
				erased += 1;
			}
		}
		return { erased, more: false };
	},
});

export const erase = internalAction({
	args: {},
	handler: async (ctx): Promise<void> => {
		const now = Date.now();
		for (let i = 0; i < 100; i += 1) {
			const result: { erased: number; more: boolean } = await ctx.runMutation(
				internal.clinicRetention.eraseDue,
				{ now },
			);
			if (!result.more) return;
		}
	},
});
