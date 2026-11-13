import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
	auditBatch,
	clientByLegacy,
	MAX_BATCH,
	orphan,
	packageByLegacy,
	resultValidator,
	type UpsertResult,
	upsertRow,
} from "./importSupport";
import { paymentMethodValidator } from "./validators";

/** Packages and their payment ledger, keyed on the old id. Used sessions are NOT imported: they derive from visits. */
export const upsertPackages = internalMutation({
	args: {
		tenant: v.string(),
		rows: v.array(
			v.object({
				legacyId: v.string(),
				fingerprint: v.string(),
				clientLegacy: v.string(),
				sessionType: v.string(),
				totalSessions: v.number(),
				bonusSessions: v.number(),
				priceMinor: v.number(),
				startDate: v.optional(v.string()),
				notes: v.optional(v.string()),
				createdAt: v.number(),
			}),
		),
	},
	returns: v.array(resultValidator),
	handler: async (ctx, { tenant, rows }) => {
		if (rows.length > MAX_BATCH) throw new Error("batch too large");
		const out: UpsertResult[] = [];
		const now = Date.now();
		for (const r of rows) {
			const client = await clientByLegacy(ctx, tenant, r.clientLegacy);
			if (client === null) {
				out.push(orphan(r.legacyId, "client"));
				continue;
			}
			const owned = {
				client: client._id,
				sessionType: r.sessionType,
				totalSessions: r.totalSessions,
				bonusSessions: r.bonusSessions,
				priceMinor: r.priceMinor,
				startDate: r.startDate,
				notes: r.notes,
				fingerprint: r.fingerprint,
				updatedAt: now,
			};
			out.push(
				await upsertRow({
					legacyId: r.legacyId,
					fingerprint: r.fingerprint,
					find: async () => {
						const f = await packageByLegacy(ctx, tenant, r.legacyId);
						return f === null
							? null
							: { id: f._id, fingerprint: f.fingerprint, version: f.version };
					},
					insert: () =>
						ctx.db.insert("packages", {
							tenant,
							legacyId: r.legacyId,
							version: 1,
							createdAt: r.createdAt,
							...owned,
						}),
					update: async (id, version) => {
						const target = ctx.db.normalizeId("packages", id);
						if (target !== null) await ctx.db.patch(target, { ...owned, version });
					},
				}),
			);
		}
		await auditBatch(ctx, tenant, "packages", out);
		return out;
	},
});

export const upsertPayments = internalMutation({
	args: {
		tenant: v.string(),
		rows: v.array(
			v.object({
				legacyId: v.string(),
				fingerprint: v.string(),
				clientLegacy: v.string(),
				packageLegacy: v.optional(v.string()),
				amountMinor: v.number(),
				method: v.optional(paymentMethodValidator),
				at: v.number(),
			}),
		),
	},
	returns: v.array(resultValidator),
	handler: async (ctx, { tenant, rows }) => {
		if (rows.length > MAX_BATCH) throw new Error("batch too large");
		const out: UpsertResult[] = [];
		for (const r of rows) {
			const client = await clientByLegacy(ctx, tenant, r.clientLegacy);
			const pack =
				r.packageLegacy === undefined
					? undefined
					: await packageByLegacy(ctx, tenant, r.packageLegacy);
			if (client === null || pack === null) {
				out.push(orphan(r.legacyId, client === null ? "client" : "package"));
				continue;
			}
			const owned = {
				client: client._id,
				package: pack?._id,
				amountMinor: r.amountMinor,
				method: r.method,
				at: r.at,
				fingerprint: r.fingerprint,
			};
			out.push(
				await upsertRow({
					legacyId: r.legacyId,
					fingerprint: r.fingerprint,
					find: async () => {
						const f = await ctx.db
							.query("payments")
							.withIndex("by_tenant_legacy", (q) =>
								q.eq("tenant", tenant).eq("legacyId", r.legacyId),
							)
							.unique();
						return f === null
							? null
							: { id: f._id, fingerprint: f.fingerprint, version: f.version };
					},
					insert: () =>
						ctx.db.insert("payments", {
							tenant,
							legacyId: r.legacyId,
							version: 1,
							createdBy: "system:import",
							...owned,
						}),
					update: async (id, version) => {
						const target = ctx.db.normalizeId("payments", id);
						if (target !== null) await ctx.db.patch(target, { ...owned, version });
					},
				}),
			);
		}
		await auditBatch(ctx, tenant, "payments", out);
		return out;
	},
});
