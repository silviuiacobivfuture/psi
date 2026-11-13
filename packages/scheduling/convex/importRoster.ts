import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import {
	auditBatch,
	MAX_BATCH,
	orphan,
	practitionerByLegacy,
	resultValidator,
	staffByLegacy,
	type UpsertResult,
	upsertRow,
} from "./importSupport";
import { rosterStatusValidator } from "./validators";

/** The roster and staff blocks, keyed on the old id. A person is a practitioner or a staff member. */
const personRef = v.object({
	kind: v.union(v.literal("practitioner"), v.literal("staff")),
	legacyId: v.string(),
});

type Person =
	| { kind: "practitioner"; id: Id<"practitioners"> }
	| { kind: "staff"; id: Id<"staffMembers"> };

async function resolvePerson(
	ctx: MutationCtx,
	tenant: string,
	ref: { kind: "practitioner" | "staff"; legacyId: string },
): Promise<Person | null> {
	if (ref.kind === "practitioner") {
		const found = await practitionerByLegacy(ctx, tenant, ref.legacyId);
		return found === null ? null : { kind: "practitioner", id: found._id };
	}
	const found = await staffByLegacy(ctx, tenant, ref.legacyId);
	return found === null ? null : { kind: "staff", id: found._id };
}

export const upsertRosterDays = internalMutation({
	args: {
		tenant: v.string(),
		rows: v.array(
			v.object({
				legacyId: v.string(),
				fingerprint: v.string(),
				person: personRef,
				date: v.string(),
				status: rosterStatusValidator,
				startMinutes: v.optional(v.number()),
				endMinutes: v.optional(v.number()),
				notes: v.optional(v.string()),
			}),
		),
	},
	returns: v.array(resultValidator),
	handler: async (ctx, { tenant, rows }) => {
		if (rows.length > MAX_BATCH) throw new Error("batch too large");
		const out: UpsertResult[] = [];
		const now = Date.now();
		for (const r of rows) {
			const person = await resolvePerson(ctx, tenant, r.person);
			if (person === null) {
				out.push(orphan(r.legacyId, `person.${r.person.kind}`));
				continue;
			}
			const owned = {
				person,
				personKey: `${person.kind}:${person.id}`,
				date: r.date,
				status: r.status,
				startMinutes: r.startMinutes,
				endMinutes: r.endMinutes,
				notes: r.notes,
				fingerprint: r.fingerprint,
				updatedAt: now,
			};
			out.push(
				await upsertRow({
					legacyId: r.legacyId,
					fingerprint: r.fingerprint,
					find: async () => {
						const f = await ctx.db
							.query("rosterDays")
							.withIndex("by_tenant_legacy", (q) =>
								q.eq("tenant", tenant).eq("legacyId", r.legacyId),
							)
							.unique();
						return f === null
							? null
							: { id: f._id, fingerprint: f.fingerprint, version: f.version };
					},
					insert: () =>
						ctx.db.insert("rosterDays", { tenant, legacyId: r.legacyId, version: 1, ...owned }),
					update: async (id, version) => {
						const target = ctx.db.normalizeId("rosterDays", id);
						if (target !== null) await ctx.db.patch(target, { ...owned, version });
					},
				}),
			);
		}
		await auditBatch(ctx, tenant, "rosterDays", out);
		return out;
	},
});

export const upsertStaffBlocks = internalMutation({
	args: {
		tenant: v.string(),
		rows: v.array(
			v.object({
				legacyId: v.string(),
				fingerprint: v.string(),
				person: personRef,
				dateStart: v.string(),
				dateEnd: v.string(),
				reason: v.string(),
				notes: v.optional(v.string()),
				createdAt: v.number(),
			}),
		),
	},
	returns: v.array(resultValidator),
	handler: async (ctx, { tenant, rows }) => {
		if (rows.length > MAX_BATCH) throw new Error("batch too large");
		const out: UpsertResult[] = [];
		for (const r of rows) {
			const person = await resolvePerson(ctx, tenant, r.person);
			if (person === null) {
				out.push(orphan(r.legacyId, `person.${r.person.kind}`));
				continue;
			}
			const owned = {
				person,
				personKey: `${person.kind}:${person.id}`,
				dateStart: r.dateStart,
				dateEnd: r.dateEnd,
				reason: r.reason,
				notes: r.notes,
				fingerprint: r.fingerprint,
			};
			out.push(
				await upsertRow({
					legacyId: r.legacyId,
					fingerprint: r.fingerprint,
					find: async () => {
						const f = await ctx.db
							.query("staffBlocks")
							.withIndex("by_tenant_legacy", (q) =>
								q.eq("tenant", tenant).eq("legacyId", r.legacyId),
							)
							.unique();
						return f === null
							? null
							: { id: f._id, fingerprint: f.fingerprint, version: f.version };
					},
					insert: () =>
						ctx.db.insert("staffBlocks", {
							tenant,
							legacyId: r.legacyId,
							version: 1,
							createdAt: r.createdAt,
							...owned,
						}),
					update: async (id, version) => {
						const target = ctx.db.normalizeId("staffBlocks", id);
						if (target !== null) await ctx.db.patch(target, { ...owned, version });
					},
				}),
			);
		}
		await auditBatch(ctx, tenant, "staffBlocks", out);
		return out;
	},
});
