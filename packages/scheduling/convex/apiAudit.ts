import { v } from "convex/values";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, makeAuditEvent } from "../src/clinic/audit";
import { mutation, query } from "./_generated/server";
import { REFUSED } from "./apiSupport";
import { requireServer } from "./guard";
import { actorValidator, serverKeyValidator } from "./validators";

/** Appends to and reads the audit log. There is no free text: an event is an action, an entity, field names and a count. */
export const append = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		action: v.union(...AUDIT_ACTIONS.map((a) => v.literal(a))),
		entity: v.union(...AUDIT_ENTITIES.map((e) => v.literal(e))),
		entityId: v.string(),
		fields: v.optional(v.array(v.string())),
		count: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const made = makeAuditEvent({
			tenant: args.tenant,
			at: Date.now(),
			actor: args.actor.subject,
			action: args.action,
			entity: args.entity,
			entityId: args.entityId,
			...(args.fields === undefined ? {} : { fields: args.fields }),
			...(args.count === undefined ? {} : { count: args.count }),
		});
		if (!made.ok) return REFUSED("invalid");
		const e = made.event;
		const id = await ctx.db.insert("auditEvents", {
			tenant: e.tenant,
			at: e.at,
			actor: e.actor,
			action: e.action,
			entity: e.entity,
			entityId: e.entityId,
			summary: e.summary,
		});
		return { ok: true as const, id };
	},
});

/** Newest first; `before` (an instant) pages back. */
export const list = query({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		entity: v.optional(v.string()),
		entityId: v.optional(v.string()),
		before: v.optional(v.number()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const limit = Math.max(1, Math.min(200, Math.floor(args.limit ?? 100)));
		const rows =
			args.entity !== undefined && args.entityId !== undefined
				? await ctx.db
						.query("auditEvents")
						.withIndex("by_tenant_entity", (q) =>
							q
								.eq("tenant", args.tenant)
								.eq("entity", args.entity ?? "")
								.eq("entityId", args.entityId ?? "")
								.lt("at", args.before ?? Number.MAX_SAFE_INTEGER),
						)
						.order("desc")
						.take(limit)
				: await ctx.db
						.query("auditEvents")
						.withIndex("by_tenant_at", (q) =>
							q.eq("tenant", args.tenant).lt("at", args.before ?? Number.MAX_SAFE_INTEGER),
						)
						.order("desc")
						.take(limit);
		return {
			ok: true as const,
			events: rows.map((e) => ({
				id: e._id,
				at: e.at,
				actor: e.actor,
				action: e.action,
				entity: e.entity,
				entityId: e.entityId,
				summary: e.summary,
			})),
		};
	},
});
