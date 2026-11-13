import { v } from "convex/values";
import { columnKey } from "../src/clinic/visits";
import { internalMutation } from "./_generated/server";
import {
	auditBatch,
	clientByLegacy,
	deviceByLegacy,
	groupByLegacy,
	MAX_BATCH,
	orphan,
	packageByLegacy,
	practitionerByLegacy,
	resultValidator,
	roomByLegacy,
	type UpsertResult,
	upsertRow,
	visitByLegacy,
} from "./importSupport";
import {
	attendanceValidator,
	creditTypeValidator,
	encryptedValidator,
	paymentMethodValidator,
	statusValidator,
} from "./validators";

/**
 * Staff-made appointments, keyed on the old id. Columns, rooms, devices, clients and packages come
 * as legacy ids and are resolved here; one that does not resolve makes the row an orphan (nothing
 * written). Therapist notes arrive encrypted.
 */
const columnRef = v.object({
	kind: v.union(
		v.literal("practitioner"),
		v.literal("device"),
		v.literal("room"),
		v.literal("group"),
	),
	legacyId: v.string(),
});

export const upsertVisits = internalMutation({
	args: {
		tenant: v.string(),
		rows: v.array(
			v.object({
				legacyId: v.string(),
				fingerprint: v.string(),
				column: columnRef,
				clientLegacy: v.optional(v.string()),
				roomLegacy: v.optional(v.string()),
				deviceLegacy: v.optional(v.string()),
				packageLegacy: v.optional(v.string()),
				start: v.number(),
				end: v.number(),
				durationMinutes: v.number(),
				sessionType: v.string(),
				status: statusValidator,
				attendance: attendanceValidator,
				notes: v.optional(v.string()),
				therapistNotes: v.optional(encryptedValidator),
				priceMinor: v.optional(v.number()),
				amountPaidMinor: v.optional(v.number()),
				paymentMethod: v.optional(paymentMethodValidator),
				creditType: v.optional(creditTypeValidator),
				reminderSent: v.boolean(),
				clientConfirmed: v.boolean(),
				createdBy: v.string(),
				createdAt: v.number(),
			}),
		),
	},
	returns: v.array(resultValidator),
	handler: async (ctx, { tenant, rows }) => {
		if (rows.length > MAX_BATCH) throw new Error("batch too large");
		const out: UpsertResult[] = [];
		for (const r of rows) {
			const col = r.column;
			const column =
				col.kind === "practitioner"
					? await practitionerByLegacy(ctx, tenant, col.legacyId).then((d) =>
							d === null ? null : ({ kind: "practitioner", id: d._id } as const),
						)
					: col.kind === "device"
						? await deviceByLegacy(ctx, tenant, col.legacyId).then((d) =>
								d === null ? null : ({ kind: "device", id: d._id } as const),
							)
						: col.kind === "room"
							? await roomByLegacy(ctx, tenant, col.legacyId).then((d) =>
									d === null ? null : ({ kind: "room", id: d._id } as const),
								)
							: await groupByLegacy(ctx, tenant, col.legacyId).then((d) =>
									d === null ? null : ({ kind: "group", id: d._id } as const),
								);
			if (column === null) {
				out.push(orphan(r.legacyId, `column.${col.kind}`));
				continue;
			}
			const client =
				r.clientLegacy === undefined
					? undefined
					: await clientByLegacy(ctx, tenant, r.clientLegacy);
			if (client === null) {
				out.push(orphan(r.legacyId, "client"));
				continue;
			}
			const room =
				r.roomLegacy === undefined ? undefined : await roomByLegacy(ctx, tenant, r.roomLegacy);
			if (room === null) {
				out.push(orphan(r.legacyId, "room"));
				continue;
			}
			const device =
				r.deviceLegacy === undefined
					? undefined
					: await deviceByLegacy(ctx, tenant, r.deviceLegacy);
			if (device === null) {
				out.push(orphan(r.legacyId, "device"));
				continue;
			}
			const pack =
				r.packageLegacy === undefined
					? undefined
					: await packageByLegacy(ctx, tenant, r.packageLegacy);
			if (pack === null) {
				out.push(orphan(r.legacyId, "package"));
				continue;
			}
			const now = Date.now();
			const owned = {
				client: client?._id,
				column,
				columnKey: columnKey(column),
				room: room?._id,
				device: device?._id,
				package: pack?._id,
				start: r.start,
				end: r.end,
				durationMinutes: r.durationMinutes,
				sessionType: r.sessionType,
				status: r.status,
				attendance: r.attendance,
				notes: r.notes,
				therapistNotes: r.therapistNotes,
				priceMinor: r.priceMinor,
				amountPaidMinor: r.amountPaidMinor,
				paymentMethod: r.paymentMethod,
				creditType: r.creditType,
				reminderSent: r.reminderSent,
				clientConfirmed: r.clientConfirmed,
				fingerprint: r.fingerprint,
				updatedAt: now,
			};
			out.push(
				await upsertRow({
					legacyId: r.legacyId,
					fingerprint: r.fingerprint,
					find: async () => {
						const f = await visitByLegacy(ctx, tenant, r.legacyId);
						return f === null
							? null
							: { id: f._id, fingerprint: f.fingerprint, version: f.version };
					},
					insert: () =>
						ctx.db.insert("visits", {
							tenant,
							legacyId: r.legacyId,
							version: 1,
							createdBy: r.createdBy,
							createdAt: r.createdAt,
							...owned,
						}),
					update: async (id, version) => {
						const target = ctx.db.normalizeId("visits", id);
						if (target !== null) await ctx.db.patch(target, { ...owned, version });
					},
				}),
			);
		}
		await auditBatch(ctx, tenant, "visits", out);
		return out;
	},
});
