import { v } from "convex/values";
import { planChange } from "../src/clinic/change";
import { columnKey } from "../src/clinic/visits";
import type { Doc } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { owned, REFUSED, record, stale } from "./apiSupport";
import { recordOverride, staffGate } from "./blacklistGate";
import { requireServer } from "./guard";
import {
	actorValidator,
	overrideValidator,
	serverKeyValidator,
	visitMetaValidator,
} from "./validators";
import { columnArg, links } from "./visitLinks";
import { moveIsTaken, prepareMove } from "./visitMove";

/** Fields that exist only to make another one searchable: the audit event names what a person changed, not these. */
const DERIVED = ["durationMinutes", "columnKey"];

/**
 * One edit of a staff visit, all or nothing: the client, the package (taken out of one with `null`), the session type,
 * the price, the note, the API's own facts (`meta`), the confirmation of a requested visit and a move in time or place.
 * Every refusal is decided before the first write, so a refusal changes nothing (a Convex mutation that returns after a
 * write has still committed it, which is why nothing here writes until every check has passed). The blacklist is asked
 * about the client the visit will have when the client changes or the visit moves.
 */
export const edit = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		visit: v.string(),
		expectedVersion: v.optional(v.number()),
		client: v.optional(v.string()),
		package: v.optional(v.union(v.string(), v.null())),
		sessionType: v.optional(v.string()),
		priceMinor: v.optional(v.number()),
		notes: v.optional(v.string()),
		meta: v.optional(visitMetaValidator),
		/** A requested visit the client confirmed. */
		confirm: v.optional(v.literal(true)),
		move: v.optional(
			v.object({
				start: v.number(),
				end: v.number(),
				column: v.optional(columnArg),
				room: v.optional(v.string()),
				device: v.optional(v.string()),
			}),
		),
		override: v.optional(overrideValidator),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "visits", args.tenant, args.visit);
		if (row === null || row.deletedAt !== undefined) return REFUSED("not_found");
		if (stale(row.version, args.expectedVersion)) return REFUSED("stale");
		if (row.status !== "confirmed" && row.status !== "requested") return REFUSED("not_allowed");
		if (args.confirm === true && row.status !== "requested") return REFUSED("not_requested");
		if (
			args.priceMinor !== undefined &&
			(!Number.isInteger(args.priceMinor) || args.priceMinor < 0)
		)
			return REFUSED("negative_money");
		if (args.meta !== undefined && args.meta.practitioner.trim() === "") return REFUSED("invalid");

		const linked = await links(ctx, args.tenant, {
			client: args.client,
			package: typeof args.package === "string" ? args.package : undefined,
		});
		if (!linked.ok) return REFUSED(linked.reason);
		const client = linked.client ?? row.client;
		const pack = args.package === null ? undefined : (linked.package ?? row.package);
		if (pack !== undefined) {
			const held = await ctx.db.get(pack);
			if (held === null || held.client !== client) return REFUSED("package_not_clients");
		}

		const clientChanged = linked.client !== undefined && linked.client !== row.client;
		const moved = args.move !== undefined;
		const prepared =
			args.move === undefined ? undefined : await prepareMove(ctx, args.tenant, row, args.move);
		if (prepared !== undefined && !prepared.ok) return REFUSED(prepared.reason);
		const gate =
			clientChanged || moved
				? await staffGate(
						ctx,
						args.tenant,
						client === undefined ? undefined : await ctx.db.get(client),
						args.override,
						Date.now(),
					)
				: {};
		if (gate.stop !== undefined) return gate.stop;
		if (
			prepared?.ok === true &&
			args.move !== undefined &&
			(await moveIsTaken(ctx, args.tenant, row, prepared.move, args.move))
		)
			return REFUSED("overlaps");

		const patch: Partial<Doc<"visits">> = {
			...(linked.client === undefined ? {} : { client: linked.client }),
			...(args.package === null
				? { package: undefined, creditType: undefined }
				: linked.package === undefined
					? {}
					: { package: linked.package }),
			...(args.sessionType === undefined ? {} : { sessionType: args.sessionType }),
			...(args.priceMinor === undefined ? {} : { priceMinor: args.priceMinor }),
			...(args.notes === undefined ? {} : { notes: args.notes }),
			...(args.meta === undefined ? {} : { meta: args.meta }),
			...(args.confirm === true ? { status: "confirmed" as const } : {}),
			...(prepared?.ok === true && args.move !== undefined
				? {
						start: args.move.start,
						end: args.move.end,
						durationMinutes: prepared.move.durationMinutes,
						column: prepared.move.column,
						columnKey: columnKey(prepared.move.column),
						room: prepared.move.room,
						device: prepared.move.device,
					}
				: {}),
		};
		const change = planChange(row, patch);
		if (!change.changed)
			return { ok: true as const, changed: false as const, version: row.version };
		await ctx.db.patch(row._id, { ...patch, updatedAt: Date.now(), version: change.nextVersion });
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "visit.update",
			entity: "visit",
			entityId: row._id,
			kind: "visit",
			version: change.nextVersion,
			fields: change.fields.filter((f) => !DERIVED.includes(f)),
		});
		if ("overridden" in gate && gate.overridden !== undefined)
			await recordOverride(ctx, args.tenant, args.actor.subject, gate.overridden, row._id);
		return { ok: true as const, changed: true as const, version: change.nextVersion };
	},
});
