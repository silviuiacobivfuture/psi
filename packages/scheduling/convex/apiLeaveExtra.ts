import { v } from "convex/values";
import { isLocalDate } from "../src/domain/time";
import type { Doc } from "./_generated/dataModel";
import { mutation, type QueryCtx, query } from "./_generated/server";
import { owned, REFUSED, record } from "./apiSupport";
import { requireServer } from "./guard";
import { actorValidator, serverKeyValidator } from "./validators";

/** Leave requests for the staff API: a request with its decision (the roster days follow when it is approved). */
// Leave requests -------------------------------------------------------------------------------

const leaveOut = (l: Doc<"leaveRequests">) => ({
	id: l._id,
	person: l.person,
	from: l.from,
	to: l.to,
	kind: l.kind,
	status: l.status,
	decidedBy: l.decidedBy,
	createdAt: l.createdAt,
	updatedAt: l.updatedAt,
});

const personArg = v.object({
	kind: v.union(v.literal("practitioner"), v.literal("staff")),
	id: v.string(),
});

async function resolvePerson(
	ctx: QueryCtx,
	tenant: string,
	p: { kind: "practitioner" | "staff"; id: string },
): Promise<Doc<"leaveRequests">["person"] | null> {
	if (p.kind === "staff") {
		const found = await owned(ctx, "staffMembers", tenant, p.id);
		return found === null ? null : { kind: "staff", id: found._id };
	}
	const found = await owned(ctx, "practitioners", tenant, p.id);
	return found === null ? null : { kind: "practitioner", id: found._id };
}

export const createLeave = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		person: personArg,
		from: v.string(),
		to: v.string(),
		kind: v.union(v.literal("co"), v.literal("cm")),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const who = await resolvePerson(ctx, args.tenant, args.person);
		if (who === null) return REFUSED("unknown_person");
		if (!isLocalDate(args.from) || !isLocalDate(args.to) || args.to < args.from)
			return REFUSED("bad_date");
		const now = Date.now();
		const id = await ctx.db.insert("leaveRequests", {
			tenant: args.tenant,
			person: who,
			personKey: `${who.kind}:${who.id}`,
			from: args.from,
			to: args.to,
			kind: args.kind,
			status: "pending",
			createdAt: now,
			updatedAt: now,
			version: 1,
		});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "roster.set",
			entity: "roster",
			entityId: id,
			kind: "roster",
			version: 1,
			fields: ["leave"],
		});
		return { ok: true as const, id };
	},
});

export const decideLeave = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		leave: v.string(),
		decision: v.union(v.literal("approved"), v.literal("rejected")),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "leaveRequests", args.tenant, args.leave);
		if (row === null) return REFUSED("not_found");
		if (row.status !== "pending") return REFUSED("not_allowed");
		const version = row.version + 1;
		await ctx.db.patch(row._id, {
			status: args.decision,
			decidedBy: args.actor.subject,
			updatedAt: Date.now(),
			version,
		});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "roster.set",
			entity: "roster",
			entityId: row._id,
			kind: "roster",
			version,
			fields: ["leave", "status"],
		});
		return { ok: true as const };
	},
});

export const removeLeave = mutation({
	args: { key: serverKeyValidator, tenant: v.string(), actor: actorValidator, leave: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "leaveRequests", args.tenant, args.leave);
		if (row === null) return REFUSED("not_found");
		await ctx.db.delete(row._id);
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "roster.set",
			entity: "roster",
			entityId: row._id,
			kind: "roster",
			version: row.version + 1,
			fields: ["leave", "deleted"],
		});
		return { ok: true as const };
	},
});

export const leaves = query({
	args: { key: serverKeyValidator, tenant: v.string(), leave: v.optional(v.string()) },
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (args.leave !== undefined) {
			const row = await owned(ctx, "leaveRequests", args.tenant, args.leave);
			return { ok: true as const, leaves: row === null ? [] : [leaveOut(row)] };
		}
		const rows = await ctx.db
			.query("leaveRequests")
			.withIndex("by_tenant_from", (q) => q.eq("tenant", args.tenant))
			.collect();
		return { ok: true as const, leaves: rows.map(leaveOut) };
	},
});
