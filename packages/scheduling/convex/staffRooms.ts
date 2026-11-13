import { v } from "convex/values";
import { ROOM_KINDS } from "../src/domain/rooms";
import { addDays, isLocalDate } from "../src/domain/time";
import { mutation, query } from "./_generated/server";
import { record } from "./apiSupport";
import { requireServer } from "./guard";
import { cleanText, ensureTenantRow, SLUG } from "./setupSupport";
import { actorValidator, audienceValidator, serverKeyValidator } from "./validators";

/**
 * The team's rooms: named, of a kind, with a capacity, who they suit and what they hold, and the
 * days they are out of use. Rooms are taken offline, never deleted (appointments point to them).
 * Same rules as the rest of the setup: server key, the acting subject recorded, a refused call
 * writes nothing.
 */
const KIND_SET: ReadonlySet<string> = new Set(ROOM_KINDS);
const TAG = /^[a-z0-9][a-z0-9-]{0,30}$/;
const MAX_CLOSURE_DAYS = 62;

function cleanTags(tags: ReadonlyArray<string>): string[] | undefined {
	const unique = [...new Set(tags.map((t) => t.trim().toLowerCase()))];
	return unique.length <= 12 && unique.every((t) => TAG.test(t)) ? unique : undefined;
}

const roomFields = {
	name: v.string(),
	kind: v.string(),
	capacity: v.number(),
	suits: v.array(audienceValidator),
	equipment: v.array(v.string()),
};

export const createRoom = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		slug: v.string(),
		...roomFields,
		actor: actorValidator,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const name = cleanText(args.name);
		const equipment = cleanTags(args.equipment);
		const suits = [...new Set(args.suits)];
		if (
			!SLUG.test(args.tenant) ||
			!SLUG.test(args.slug) ||
			name === undefined ||
			equipment === undefined ||
			!KIND_SET.has(args.kind) ||
			!Number.isInteger(args.capacity) ||
			args.capacity < 1 ||
			args.capacity > 50 ||
			suits.length === 0
		) {
			return { ok: false as const, reason: "invalid" as const };
		}
		const found = await ctx.db
			.query("rooms")
			.withIndex("by_tenant_slug", (q) => q.eq("tenant", args.tenant).eq("slug", args.slug))
			.unique();
		if (found !== null) {
			const same =
				found.name === name &&
				found.kind === args.kind &&
				found.capacity === args.capacity &&
				found.suits.length === suits.length &&
				suits.every((s) => found.suits.includes(s)) &&
				found.equipment.length === equipment.length &&
				equipment.every((t) => found.equipment.includes(t));
			return same
				? { ok: true as const, id: found._id, created: false }
				: { ok: false as const, reason: "exists" as const };
		}
		await ensureTenantRow(ctx, args.tenant);
		const id = await ctx.db.insert("rooms", {
			tenant: args.tenant,
			slug: args.slug,
			name,
			kind: args.kind,
			capacity: args.capacity,
			suits,
			equipment,
			active: true,
			updatedBy: args.actor.subject,
			updatedAt: Date.now(),
		});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "builder.change",
			entity: "builder",
			entityId: id,
			kind: "room",
			version: 1,
			fields: ["room"],
		});
		return { ok: true as const, id, created: true };
	},
});

export const updateRoom = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		room: v.string(),
		patch: v.object({
			name: v.optional(v.string()),
			kind: v.optional(v.string()),
			capacity: v.optional(v.number()),
			suits: v.optional(v.array(audienceValidator)),
			equipment: v.optional(v.array(v.string())),
			active: v.optional(v.boolean()),
		}),
		actor: actorValidator,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const id = ctx.db.normalizeId("rooms", args.room);
		const row = id === null ? null : await ctx.db.get(id);
		if (row === null || row.tenant !== args.tenant) {
			return { ok: false as const, reason: "not_found" as const };
		}
		const p = args.patch;
		const name = p.name === undefined ? row.name : cleanText(p.name);
		const equipment = p.equipment === undefined ? row.equipment : cleanTags(p.equipment);
		const suits = p.suits === undefined ? row.suits : [...new Set(p.suits)];
		const kind = p.kind ?? row.kind;
		const capacity = p.capacity ?? row.capacity;
		if (
			name === undefined ||
			equipment === undefined ||
			suits.length === 0 ||
			!KIND_SET.has(kind) ||
			!Number.isInteger(capacity) ||
			capacity < 1 ||
			capacity > 50
		) {
			return { ok: false as const, reason: "invalid" as const };
		}
		await ctx.db.patch(row._id, {
			name,
			kind,
			capacity,
			suits,
			equipment,
			active: p.active ?? row.active,
			updatedBy: args.actor.subject,
			updatedAt: Date.now(),
		});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "builder.change",
			entity: "builder",
			entityId: row._id,
			kind: "room",
			version: (row.version ?? 0) + 1,
			fields: ["room"],
		});
		return { ok: true as const };
	},
});

/** Takes a room out of use for whole dates (`from` to `to`, at most 62) or, for one date, part of it. */
export const addRoomClosure = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		room: v.string(),
		from: v.string(),
		to: v.string(),
		start: v.optional(v.number()),
		end: v.optional(v.number()),
		actor: actorValidator,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const id = ctx.db.normalizeId("rooms", args.room);
		const row = id === null ? null : await ctx.db.get(id);
		if (row === null || row.tenant !== args.tenant) {
			return { ok: false as const, reason: "not_found" as const };
		}
		const timed = args.start !== undefined || args.end !== undefined;
		if (
			!isLocalDate(args.from) ||
			!isLocalDate(args.to) ||
			args.from > args.to ||
			(timed &&
				(args.from !== args.to ||
					args.start === undefined ||
					args.end === undefined ||
					!Number.isInteger(args.start) ||
					!Number.isInteger(args.end) ||
					args.start < 0 ||
					args.end > 1440 ||
					args.start >= args.end))
		) {
			return { ok: false as const, reason: "invalid" as const };
		}
		const days: string[] = [];
		for (let d = args.from; d <= args.to && days.length <= MAX_CLOSURE_DAYS; d = addDays(d, 1))
			days.push(d);
		if (days.length > MAX_CLOSURE_DAYS) return { ok: false as const, reason: "invalid" as const };
		const existing = await ctx.db
			.query("roomClosures")
			.withIndex("by_room_date", (q) =>
				q.eq("room", row._id).gte("date", args.from).lte("date", args.to),
			)
			.collect();
		let added = 0;
		for (const date of days) {
			const dup = existing.some(
				(c) => c.date === date && c.start === args.start && c.end === args.end,
			);
			if (dup) continue;
			await ctx.db.insert("roomClosures", {
				room: row._id,
				date,
				...(args.start === undefined ? {} : { start: args.start }),
				...(args.end === undefined ? {} : { end: args.end }),
				createdBy: args.actor.subject,
			});
			added += 1;
		}
		if (added > 0) {
			await record(ctx, {
				tenant: args.tenant,
				actor: args.actor.subject,
				action: "builder.change",
				entity: "builder",
				entityId: row._id,
				kind: "room",
				version: 1,
				fields: ["closure"],
			});
		}
		return { ok: true as const, added };
	},
});

export const removeRoomClosure = mutation({
	args: { key: serverKeyValidator, tenant: v.string(), closure: v.string(), actor: actorValidator },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const id = ctx.db.normalizeId("roomClosures", args.closure);
		const row = id === null ? null : await ctx.db.get(id);
		const room = row === null ? null : await ctx.db.get(row.room);
		if (row === null || room === null || room.tenant !== args.tenant) {
			return { ok: false as const, reason: "not_found" as const };
		}
		await ctx.db.delete(row._id);
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "builder.change",
			entity: "builder",
			entityId: room._id,
			kind: "room",
			version: 1,
			fields: ["closure"],
		});
		return { ok: true as const };
	},
});

/** Every room of the tenant, inactive included, and the closures from a date on. */
export const rooms = query({
	args: { key: serverKeyValidator, tenant: v.string(), fromDate: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (!isLocalDate(args.fromDate)) return { ok: false as const, reason: "invalid" as const };
		const rows = await ctx.db
			.query("rooms")
			.withIndex("by_tenant_slug", (q) => q.eq("tenant", args.tenant))
			.collect();
		const out = [];
		for (const r of rows) {
			const closures = await ctx.db
				.query("roomClosures")
				.withIndex("by_room_date", (q) => q.eq("room", r._id).gte("date", args.fromDate))
				.collect();
			out.push({
				id: r._id,
				slug: r.slug,
				name: r.name,
				kind: r.kind,
				capacity: r.capacity,
				suits: r.suits,
				equipment: r.equipment,
				active: r.active,
				closures: closures
					.sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? 0) - (b.start ?? 0))
					.map((c) => ({
						id: c._id,
						date: c.date,
						...(c.start === undefined ? {} : { start: c.start }),
						...(c.end === undefined ? {} : { end: c.end }),
					})),
			});
		}
		return { ok: true as const, rooms: out };
	},
});
