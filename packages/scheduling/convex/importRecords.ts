import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import {
	auditBatch,
	clientRef,
	definitionOf,
	MAX_BATCH,
	orphan,
	practitionerByLegacy,
	refused,
	resultValidator,
	type UpsertResult,
	upsertRow,
	visitByLegacy,
} from "./importSupport";
import { encryptedValidator, fileKindValidator } from "./validators";

/** Clinical form responses (the answers arrive as one encrypted payload) and file metadata. */
export const upsertResponses = internalMutation({
	args: {
		tenant: v.string(),
		rows: v.array(
			v.object({
				legacyId: v.string(),
				fingerprint: v.string(),
				definitionKey: v.string(),
				definitionVersion: v.number(),
				/** Absent: the response belongs to no client (its client was deleted in the old app). */
				clientLegacy: v.optional(v.string()),
				visitLegacy: v.optional(v.string()),
				practitionerLegacy: v.optional(v.string()),
				payload: encryptedValidator,
				createdAt: v.number(),
				updatedAt: v.number(),
			}),
		),
	},
	returns: v.array(resultValidator),
	handler: async (ctx, { tenant, rows }) => {
		if (rows.length > MAX_BATCH) throw new Error("batch too large");
		const out: UpsertResult[] = [];
		for (const r of rows) {
			const definition = await definitionOf(ctx, tenant, r.definitionKey, r.definitionVersion);
			// A client that is named must exist and not be erased (an erased client's reports never come back, with or
			// without a client); only a row that names none is kept unattached.
			const clientOf = await clientRef(ctx, tenant, r.clientLegacy);
			if (!clientOf.ok) {
				out.push(refused(r.legacyId, clientOf.flag));
				continue;
			}
			const client = clientOf.client;
			const visit =
				r.visitLegacy === undefined ? undefined : await visitByLegacy(ctx, tenant, r.visitLegacy);
			const practitioner =
				r.practitionerLegacy === undefined
					? undefined
					: await practitionerByLegacy(ctx, tenant, r.practitionerLegacy);
			if (definition === null || visit === null || practitioner === null) {
				const missing =
					definition === null ? "definition" : visit === null ? "visit" : "practitioner";
				out.push(orphan(r.legacyId, missing));
				continue;
			}
			const owned = {
				definition: definition._id,
				definitionKey: r.definitionKey,
				definitionVersion: r.definitionVersion,
				client: client?._id,
				visit: visit?._id,
				practitioner: practitioner?._id,
				payload: r.payload,
				updatedAt: r.updatedAt,
				fingerprint: r.fingerprint,
			};
			out.push(
				await upsertRow({
					legacyId: r.legacyId,
					fingerprint: r.fingerprint,
					find: async () => {
						const f = await ctx.db
							.query("formResponses")
							.withIndex("by_tenant_legacy", (q) =>
								q.eq("tenant", tenant).eq("legacyId", r.legacyId),
							)
							.unique();
						return f === null
							? null
							: { id: f._id, fingerprint: f.fingerprint, version: f.version };
					},
					insert: () =>
						ctx.db.insert("formResponses", {
							tenant,
							legacyId: r.legacyId,
							version: 1,
							createdAt: r.createdAt,
							createdBy: "system:import",
							...owned,
						}),
					update: async (id, version) => {
						const target = ctx.db.normalizeId("formResponses", id);
						if (target !== null) await ctx.db.patch(target, { ...owned, version });
					},
				}),
			);
		}
		await auditBatch(ctx, tenant, "formResponses", out);
		return out;
	},
});

export const upsertFiles = internalMutation({
	args: {
		tenant: v.string(),
		rows: v.array(
			v.object({
				legacyId: v.string(),
				fingerprint: v.string(),
				kind: fileKindValidator,
				clientLegacy: v.optional(v.string()),
				title: v.optional(v.string()),
				fileName: v.string(),
				storageKey: v.string(),
				sha256: v.string(),
				sizeBytes: v.number(),
				contentType: v.string(),
				uploadedBy: v.string(),
				encryption: v.object({ keyVersion: v.number(), iv: v.string() }),
				createdAt: v.number(),
			}),
		),
	},
	returns: v.array(resultValidator),
	handler: async (ctx, { tenant, rows }) => {
		if (rows.length > MAX_BATCH) throw new Error("batch too large");
		const out: UpsertResult[] = [];
		for (const r of rows) {
			const clientOf = await clientRef(ctx, tenant, r.clientLegacy);
			if (!clientOf.ok) {
				out.push(refused(r.legacyId, clientOf.flag));
				continue;
			}
			const client = clientOf.client;
			const owned = {
				kind: r.kind,
				client: client?._id,
				title: r.title,
				fileName: r.fileName,
				storageKey: r.storageKey,
				sha256: r.sha256,
				sizeBytes: r.sizeBytes,
				contentType: r.contentType,
				uploadedBy: r.uploadedBy,
				encryption: r.encryption,
				fingerprint: r.fingerprint,
			};
			out.push(
				await upsertRow({
					legacyId: r.legacyId,
					fingerprint: r.fingerprint,
					find: async () => {
						const f = await ctx.db
							.query("files")
							.withIndex("by_tenant_legacy", (q) =>
								q.eq("tenant", tenant).eq("legacyId", r.legacyId),
							)
							.unique();
						return f === null
							? null
							: { id: f._id, fingerprint: f.fingerprint, version: f.version };
					},
					insert: () =>
						ctx.db.insert("files", {
							tenant,
							legacyId: r.legacyId,
							version: 1,
							createdAt: r.createdAt,
							...owned,
						}),
					update: async (id, version) => {
						const target = ctx.db.normalizeId("files", id);
						if (target !== null) await ctx.db.patch(target, { ...owned, version });
					},
				}),
			);
		}
		await auditBatch(ctx, tenant, "files", out);
		return out;
	},
});

/** The fingerprints of file rows already imported, so an unchanged file is not encrypted and uploaded again. */
export const knownFiles = internalQuery({
	args: { tenant: v.string(), legacyIds: v.array(v.string()) },
	returns: v.array(v.object({ legacyId: v.string(), fingerprint: v.string() })),
	handler: async (ctx, { tenant, legacyIds }) => {
		if (legacyIds.length > MAX_BATCH) throw new Error("batch too large");
		const out: Array<{ legacyId: string; fingerprint: string }> = [];
		for (const legacyId of legacyIds) {
			const found = await ctx.db
				.query("files")
				.withIndex("by_tenant_legacy", (q) => q.eq("tenant", tenant).eq("legacyId", legacyId))
				.unique();
			if (found?.fingerprint !== undefined) out.push({ legacyId, fingerprint: found.fingerprint });
		}
		return out;
	},
});
