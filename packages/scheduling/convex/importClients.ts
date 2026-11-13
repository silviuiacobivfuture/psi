import { v } from "convex/values";
import type { ClientInput } from "../src/domain/clients";
import { identityKeys } from "../src/domain/clients";
import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import {
	auditBatch,
	clientByLegacy,
	MAX_BATCH,
	orphan,
	practitionerByLegacy,
	resultValidator,
	type UpsertResult,
	upsertRow,
} from "./importSupport";
import { audienceValidator, clientStatusValidator, encryptedValidator } from "./validators";

const guardianValidator = v.object({
	name: v.string(),
	phone: v.optional(v.string()),
	email: v.optional(v.string()),
	relationship: v.optional(v.string()),
	occupation: v.optional(v.string()),
});

/**
 * Clients, keyed on the old id. Contact and demographics are plain; the reason for coming, the
 * diagnosis and health notes arrive encrypted (Convex never sees them in the clear). The
 * treating practitioner is a relation row, written ONCE when the client is first imported: a later
 * import never moves a client (the old app's "moved by itself" bug), it only flags a difference.
 */
export const upsertClients = internalMutation({
	args: {
		tenant: v.string(),
		rows: v.array(
			v.object({
				legacyId: v.string(),
				fingerprint: v.string(),
				name: v.string(),
				kind: audienceValidator,
				phone: v.optional(v.string()),
				email: v.optional(v.string()),
				guardian: v.optional(guardianValidator),
				consent: v.object({ contact: v.boolean(), reminders: v.boolean() }),
				status: clientStatusValidator,
				archivedAt: v.optional(v.number()),
				gender: v.optional(v.string()),
				birthDate: v.optional(v.string()),
				occupation: v.optional(v.string()),
				referralSource: v.optional(v.string()),
				location: v.optional(v.string()),
				firstTherapy: v.optional(v.string()),
				mainReasonEnc: v.optional(encryptedValidator),
				diagnosisEnc: v.optional(encryptedValidator),
				healthNotesEnc: v.optional(encryptedValidator),
				createdAt: v.number(),
				/** The practitioner's legacy id (`therapists:<id>`), for the first treating relation. */
				treatingLegacy: v.optional(v.string()),
			}),
		),
	},
	returns: v.array(resultValidator),
	handler: async (ctx, { tenant, rows }) => {
		if (rows.length > MAX_BATCH) throw new Error("batch too large");
		const out: UpsertResult[] = [];
		const now = Date.now();
		for (const r of rows) {
			const present = await clientByLegacy(ctx, tenant, r.legacyId);
			if (present?.erasedAt !== undefined) {
				// Erased on purpose: the import never brings a client back.
				out.push({ legacyId: r.legacyId, id: present._id, outcome: "unchanged", flag: "erased" });
				continue;
			}
			const practitioner =
				r.treatingLegacy === undefined
					? null
					: await practitionerByLegacy(ctx, tenant, r.treatingLegacy);
			if (r.treatingLegacy !== undefined && practitioner === null) {
				out.push(orphan(r.legacyId, "practitioner"));
				continue;
			}
			const owned = {
				name: r.name,
				kind: r.kind,
				phone: r.phone,
				email: r.email,
				guardian: r.guardian,
				status: r.status,
				archivedAt: r.archivedAt,
				gender: r.gender,
				birthDate: r.birthDate,
				occupation: r.occupation,
				referralSource: r.referralSource,
				location: r.location,
				firstTherapy: r.firstTherapy,
				mainReasonEnc: r.mainReasonEnc,
				diagnosisEnc: r.diagnosisEnc,
				healthNotesEnc: r.healthNotesEnc,
				fingerprint: r.fingerprint,
				updatedAt: now,
			};
			const keyed: ClientInput = {
				name: r.name,
				kind: r.kind,
				consent: r.consent,
				...(r.phone === undefined ? {} : { phone: r.phone }),
				...(r.email === undefined ? {} : { email: r.email }),
				...(r.guardian === undefined ? {} : { guardian: r.guardian }),
			};
			const writeKeys = async (client: Id<"clients">) => {
				const old = await ctx.db
					.query("clientKeys")
					.withIndex("by_client", (q) => q.eq("client", client))
					.collect();
				for (const k of old) await ctx.db.delete(k._id);
				for (const key of identityKeys(keyed))
					await ctx.db.insert("clientKeys", { tenant, key, client });
			};
			const result = await upsertRow({
				legacyId: r.legacyId,
				fingerprint: r.fingerprint,
				find: async () => {
					const f = await clientByLegacy(ctx, tenant, r.legacyId);
					return f === null ? null : { id: f._id, fingerprint: f.fingerprint, version: f.version };
				},
				insert: async () => {
					const id = await ctx.db.insert("clients", {
						tenant,
						legacyId: r.legacyId,
						version: 1,
						source: "import",
						createdBy: "system:import",
						createdAt: r.createdAt,
						// Consent is the team's to change once the client exists: an update never rewrites it.
						consent: r.consent,
						...owned,
					});
					await writeKeys(id);
					return id;
				},
				update: async (id, version) => {
					const target = ctx.db.normalizeId("clients", id);
					if (target === null) return;
					await ctx.db.patch(target, { ...owned, version });
					await writeKeys(target);
				},
			});
			// The treating relation: written once, never rewritten by an import.
			let flag: string | undefined;
			if (practitioner !== null && result.id !== undefined) {
				const clientId = ctx.db.normalizeId("clients", result.id);
				const existing = await ctx.db
					.query("treating")
					.withIndex("by_tenant_legacy", (q) => q.eq("tenant", tenant).eq("legacyId", r.legacyId))
					.unique();
				if (existing === null && clientId !== null) {
					await ctx.db.insert("treating", {
						tenant,
						practitioner: practitioner._id,
						client: clientId,
						createdAt: now,
						createdBy: "system:import",
						legacyId: r.legacyId,
					});
				} else if (existing !== null && existing.practitioner !== practitioner._id) {
					flag = "treating_differs";
				}
			}
			out.push(flag === undefined ? result : { ...result, flag });
		}
		await auditBatch(ctx, tenant, "clients", out);
		return out;
	},
});
