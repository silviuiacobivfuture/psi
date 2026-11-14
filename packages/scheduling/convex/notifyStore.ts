import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { REFUSED } from "./apiSupport";
import { LIST_MAX, TOO_MANY_ROWS, within } from "./bounded";
import { requireServer } from "./guard";
import { serverKeyValidator } from "./validators";

/**
 * The notify outbox and the used-links record, server-keyed. A mutation is a transaction, so `claim` is atomic: of any
 * number of concurrent claims of one `jti`, exactly one answers `claimed: true`. Nothing here is audited: it holds no
 * clinic data and no one acts through it.
 */
const MAX_DUE = 200;
const PURGE_PER_CLAIM = 50;

export const outboxAdd = mutation({
	args: {
		key: serverKeyValidator,
		job: v.object({
			id: v.string(),
			idempotencyKey: v.string(),
			app: v.string(),
			event: v.string(),
			bodyJson: v.string(),
			attempts: v.number(),
			replays: v.number(),
			dueAt: v.number(),
		}),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const held = await ctx.db
			.query("notifyOutbox")
			.withIndex("by_key", (q) => q.eq("key", args.job.id))
			.first();
		if (held !== null) return { ok: true as const, added: false as const };
		const { id, ...rest } = args.job;
		await ctx.db.insert("notifyOutbox", { key: id, ...rest, createdAt: Date.now() });
		return { ok: true as const, added: true as const };
	},
});

/** Jobs due at `now`, oldest first. */
export const outboxDue = query({
	args: { key: serverKeyValidator, now: v.number(), limit: v.number() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const limit = Math.max(1, Math.min(MAX_DUE, Math.floor(args.limit)));
		const rows = await ctx.db
			.query("notifyOutbox")
			.withIndex("by_due", (q) => q.lte("dueAt", args.now))
			.take(limit);
		return {
			ok: true as const,
			jobs: rows.map((r) => ({
				id: r.key,
				idempotencyKey: r.idempotencyKey,
				app: r.app,
				event: r.event,
				bodyJson: r.bodyJson,
				attempts: r.attempts,
				replays: r.replays,
				dueAt: r.dueAt,
			})),
		};
	},
});

export const outboxReschedule = mutation({
	args: {
		key: serverKeyValidator,
		id: v.string(),
		attempts: v.number(),
		dueAt: v.number(),
		replays: v.number(),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await ctx.db
			.query("notifyOutbox")
			.withIndex("by_key", (q) => q.eq("key", args.id))
			.first();
		if (row === null) return REFUSED("not_found");
		await ctx.db.patch(row._id, {
			attempts: args.attempts,
			dueAt: args.dueAt,
			replays: args.replays,
		});
		return { ok: true as const };
	},
});

export const outboxRemove = mutation({
	args: { key: serverKeyValidator, id: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await ctx.db
			.query("notifyOutbox")
			.withIndex("by_key", (q) => q.eq("key", args.id))
			.first();
		if (row !== null) await ctx.db.delete(row._id);
		return { ok: true as const };
	},
});

export const outboxSize = query({
	args: { key: serverKeyValidator },
	handler: async (ctx, args) => {
		requireServer(args.key);
		// An operator's and a test's view: a count past the bound is refused, never read whole.
		const rows = await within(ctx.db.query("notifyOutbox"), LIST_MAX);
		return rows === undefined ? REFUSED(TOO_MANY_ROWS) : { ok: true as const, size: rows.length };
	},
});

/** Records the use of a link; only the first claim of a `jti` is `claimed`. Also drops a few links that have expired. */
export const linkClaim = mutation({
	args: { key: serverKeyValidator, jti: v.string(), expiresAt: v.number(), now: v.number() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const expired = await ctx.db
			.query("usedLinks")
			.withIndex("by_expires", (q) => q.lte("expiresAt", args.now))
			.take(PURGE_PER_CLAIM);
		for (const row of expired) await ctx.db.delete(row._id);
		const held = await ctx.db
			.query("usedLinks")
			.withIndex("by_jti", (q) => q.eq("jti", args.jti))
			.first();
		if (held !== null) return { ok: true as const, claimed: false as const };
		await ctx.db.insert("usedLinks", {
			jti: args.jti,
			usedAt: args.now,
			expiresAt: args.expiresAt,
		});
		return { ok: true as const, claimed: true as const };
	},
});

/** Gives a link back when the action it guarded failed. */
export const linkRelease = mutation({
	args: { key: serverKeyValidator, jti: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const held = await ctx.db
			.query("usedLinks")
			.withIndex("by_jti", (q) => q.eq("jti", args.jti))
			.first();
		if (held !== null) await ctx.db.delete(held._id);
		return { ok: true as const };
	},
});

/** How many used links are recorded (a test and an operator's view). */
export const linkCount = query({
	args: { key: serverKeyValidator },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const rows = await within(ctx.db.query("usedLinks"), LIST_MAX);
		return rows === undefined ? REFUSED(TOO_MANY_ROWS) : { ok: true as const, count: rows.length };
	},
});
