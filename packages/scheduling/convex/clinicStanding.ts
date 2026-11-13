import { v } from "convex/values";
import { archive, restore, softDelete, unarchive } from "../src/clinic/clients";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { record } from "./apiSupport";

/**
 * A client's standing: archive, unarchive, soft delete, restore (docs/plans/clinic.md section 2).
 * The domain decides (`src/clinic/clients.ts`); this applies it, bumps the version and writes the
 * audit event (action and field names, no content). The staff API will wrap exactly this.
 */
export type StandingAction = "archive" | "unarchive" | "delete" | "restore";

/** Applies a standing change; shared by the internal function and the server-keyed wrapper. */
export async function changeStanding(
	ctx: MutationCtx,
	args: { tenant: string; client: string; action: StandingAction; actor: string; now?: number },
): Promise<{ ok: true } | { ok: false; reason: string }> {
	const now = args.now ?? Date.now();
	const id = ctx.db.normalizeId("clients", args.client);
	const row = id === null ? null : await ctx.db.get(id);
	if (id === null || row === null || row.tenant !== args.tenant || row.erasedAt !== undefined) {
		return { ok: false, reason: "not_found" };
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
	if (!decided.ok) return { ok: false, reason: decided.reason };
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
	await record(ctx, {
		tenant: args.tenant,
		actor: args.actor,
		action: `client.${args.action}`,
		entity: "client",
		entityId: id,
		kind: "client",
		version,
		fields: Object.keys(patch),
	});
	return { ok: true };
}

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
	handler: (ctx, args) => changeStanding(ctx, args),
});
