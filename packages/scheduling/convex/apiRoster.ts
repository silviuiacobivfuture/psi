import { v } from "convex/values";
import { blockProblem, rosterProblem } from "../src/clinic/roster";
import { isLocalDate } from "../src/domain/time";
import type { Id } from "./_generated/dataModel";
import { mutation, type QueryCtx, query } from "./_generated/server";
import { owned, REFUSED, record } from "./apiSupport";
import { LIST_MAX, TOO_MANY_ROWS, within } from "./bounded";
import { requireServer } from "./guard";
import { practitionerOf } from "./setupSupport";
import { actorValidator, rosterStatusValidator, serverKeyValidator } from "./validators";

/** The roster and staff blocks for the staff API. A person is a practitioner or another member of staff. */
const personArg = v.object({
	kind: v.union(v.literal("practitioner"), v.literal("staff")),
	id: v.string(),
});

async function person(
	ctx: QueryCtx,
	tenant: string,
	p: { kind: "practitioner" | "staff"; id: string },
): Promise<
	| { kind: "practitioner"; id: Id<"practitioners"> }
	| { kind: "staff"; id: Id<"staffMembers"> }
	| null
> {
	if (p.kind === "practitioner") {
		const found = await practitionerOf(ctx, tenant, p.id);
		return found === undefined ? null : { kind: "practitioner", id: found._id };
	}
	const found = await owned(ctx, "staffMembers", tenant, p.id);
	return found === null ? null : { kind: "staff", id: found._id };
}

/** Sets one person's day (works with hours, annual or medical leave, free); replaces what was there. */
export const setDay = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		person: personArg,
		date: v.string(),
		status: rosterStatusValidator,
		startMinutes: v.optional(v.number()),
		endMinutes: v.optional(v.number()),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const who = await person(ctx, args.tenant, args.person);
		if (who === null) return REFUSED("unknown_person");
		if (!isLocalDate(args.date)) return REFUSED("bad_date");
		const entry =
			args.status === "works"
				? {
						status: "works" as const,
						startMinutes: args.startMinutes ?? Number.NaN,
						endMinutes: args.endMinutes ?? Number.NaN,
					}
				: { status: args.status };
		const problem = rosterProblem(entry);
		if (problem !== undefined) return REFUSED(problem);
		const personKey = `${who.kind}:${who.id}`;
		const existing = await ctx.db
			.query("rosterDays")
			.withIndex("by_tenant_person_date", (q) =>
				q.eq("tenant", args.tenant).eq("personKey", personKey).eq("date", args.date),
			)
			.unique();
		const fields = {
			status: args.status,
			startMinutes: args.status === "works" ? args.startMinutes : undefined,
			endMinutes: args.status === "works" ? args.endMinutes : undefined,
			notes: args.notes,
			updatedAt: Date.now(),
		};
		let id: Id<"rosterDays">;
		let version = 1;
		if (existing === null) {
			id = await ctx.db.insert("rosterDays", {
				tenant: args.tenant,
				person: who,
				personKey,
				date: args.date,
				version,
				...fields,
			});
		} else {
			id = existing._id;
			version = existing.version + 1;
			await ctx.db.patch(id, { ...fields, version });
		}
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "roster.set",
			entity: "roster",
			entityId: id,
			kind: "roster",
			version,
			fields: Object.keys(fields).filter((k) => k !== "updatedAt"),
		});
		return { ok: true as const, id, version };
	},
});

export const clearDay = mutation({
	args: { key: serverKeyValidator, tenant: v.string(), actor: actorValidator, day: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "rosterDays", args.tenant, args.day);
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
			fields: ["deleted"],
		});
		return { ok: true as const };
	},
});

export const addBlock = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		person: personArg,
		dateStart: v.string(),
		dateEnd: v.string(),
		reason: v.string(),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const who = await person(ctx, args.tenant, args.person);
		if (who === null) return REFUSED("unknown_person");
		const problem = blockProblem({
			dateStart: args.dateStart,
			dateEnd: args.dateEnd,
			reason: args.reason,
		});
		if (problem !== undefined || args.reason.trim() === "") return REFUSED(problem ?? "invalid");
		const id = await ctx.db.insert("staffBlocks", {
			tenant: args.tenant,
			person: who,
			personKey: `${who.kind}:${who.id}`,
			dateStart: args.dateStart,
			dateEnd: args.dateEnd,
			reason: args.reason,
			notes: args.notes,
			createdAt: Date.now(),
			version: 1,
		});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "staff_block.set",
			entity: "staff_block",
			entityId: id,
			kind: "staff_block",
			version: 1,
		});
		return { ok: true as const, id };
	},
});

export const removeBlock = mutation({
	args: { key: serverKeyValidator, tenant: v.string(), actor: actorValidator, block: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "staffBlocks", args.tenant, args.block);
		if (row === null) return REFUSED("not_found");
		await ctx.db.delete(row._id);
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "staff_block.set",
			entity: "staff_block",
			entityId: row._id,
			kind: "staff_block",
			version: row.version + 1,
			fields: ["deleted"],
		});
		return { ok: true as const };
	},
});

/** The roster days and blocks between two dates (at most 93 days). */
export const range = query({
	args: { key: serverKeyValidator, tenant: v.string(), from: v.string(), to: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (!isLocalDate(args.from) || !isLocalDate(args.to) || args.to < args.from)
			return REFUSED("bad_date");
		const days = await within(
			ctx.db
				.query("rosterDays")
				.withIndex("by_tenant_date", (q) =>
					q.eq("tenant", args.tenant).gte("date", args.from).lte("date", args.to),
				),
			LIST_MAX,
		);
		// A block can start long before the range and still cover it: the app's blocks, bounded, filtered by overlap.
		const held = await within(
			ctx.db
				.query("staffBlocks")
				.withIndex("by_tenant_person_start", (q) => q.eq("tenant", args.tenant)),
			LIST_MAX,
		);
		if (days === undefined || held === undefined) return REFUSED(TOO_MANY_ROWS);
		const blocks = held.filter((b) => b.dateStart <= args.to && b.dateEnd >= args.from);
		return {
			ok: true as const,
			days: days.map((d) => ({ ...d, id: d._id })),
			blocks: blocks.map((b) => ({ ...b, id: b._id })),
		};
	},
});
