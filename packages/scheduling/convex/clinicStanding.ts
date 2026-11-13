import { v } from "convex/values";
import { makeAuditEvent } from "../src/clinic/audit";
import { archive, restore, softDelete, unarchive } from "../src/clinic/clients";
import { internalMutation } from "./_generated/server";
import { logChange } from "./changeLog";

/**
 * A client's standing: archive, unarchive, soft delete, restore (docs/plans/clinic.md section 2).
 * The domain decides (`src/clinic/clients.ts`); this applies it, bumps the version and writes the
 * audit event (action and field names, no content). The staff API will wrap exactly this.
 */
export const change = internalMutation({
	args: {
		tenant: v.string(),
		client: v.string(),
		action: v.union(
			v.literal("archive"),
			v.literal("unarchive"),
			v.literal("delete"),
			v.literal("restore"),
		),
		actor: v.string(),
		now: v.optional(v.number()),
	},
	returns: v.union(
		v.object({ ok: v.literal(true) }),
		v.object({ ok: v.literal(false), reason: v.string() }),
	),
	handler: async (ctx, args) => {
		const now = args.now ?? Date.now();
		const id = ctx.db.normalizeId("clients", args.client);
		const row = id === null ? null : await ctx.db.get(id);
		if (id === null || row === null || row.tenant !== args.tenant || row.erasedAt !== undefined) {
			return { ok: false as const, reason: "not_found" };
		}
		const standing = { archivedAt: row.archivedAt, deletedAt: row.deletedAt };
		const decided =
			args.action === "archive"
				? archive(standing, now)
				: args.action === "unarchive"
					? unarchive(standing)
					: args.action === "delete"
						? softDelete(standing, now)
						: restore(standing, now);
		if (!decided.ok) return { ok: false as const, reason: decided.reason };
		const patch =
			args.action === "archive"
				? { archivedAt: now }
				: args.action === "unarchive"
					? { archivedAt: undefined }
					: args.action === "delete"
						? { deletedAt: now }
						: { deletedAt: undefined };
		const version = (row.version ?? 0) + 1;
		await ctx.db.patch(id, { ...patch, updatedAt: now, version });
		await logChange(ctx, args.tenant, "client", id, version);
		const event = makeAuditEvent({
			tenant: args.tenant,
			at: now,
			actor: args.actor,
			action: `client.${args.action}`,
			entity: "client",
			entityId: id,
			fields: Object.keys(patch),
		});
		if (!event.ok) throw new Error(`audit event refused: ${event.problems.join(",")}`);
		const { summary, ...rest } = event.event;
		await ctx.db.insert("auditEvents", {
			tenant: rest.tenant,
			at: rest.at,
			actor: rest.actor,
			action: rest.action,
			entity: rest.entity,
			entityId: rest.entityId,
			summary,
		});
		return { ok: true as const };
	},
});
