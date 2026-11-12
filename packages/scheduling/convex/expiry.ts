import { v } from "convex/values";
import { transition } from "../src/domain/lifecycle";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";

/** Holds marked per batch; small, so one batch never meets Convex's per-transaction limits. */
const BATCH = 100;
/** Batches per sweep; the next cron run picks up whatever is left. */
const MAX_BATCHES = 50;

/**
 * Marks up to `limit` lapsed holds `expired`. Availability already ignores a lapsed hold the
 * moment it lapses (see `isBlocking`); this only tidies the record for retention.
 */
export const expireBatch = internalMutation({
	args: { now: v.number(), limit: v.number() },
	handler: async (ctx, args): Promise<number> => {
		const lapsed = await ctx.db
			.query("appointments")
			.withIndex("by_status_hold", (q) => q.eq("status", "held").lte("holdExpiresAt", args.now))
			.take(args.limit);
		for (const row of lapsed) {
			const next = transition(row, { type: "expire" }, args.now);
			if (next.ok) await ctx.db.patch(row._id, { status: next.next, updatedAt: args.now });
		}
		return lapsed.length;
	},
});

/** The hold-expiry sweep the cron runs: batches until none is left (or the cap is reached). */
export const sweep = internalAction({
	args: {},
	handler: async (ctx): Promise<number> => {
		const now = Date.now();
		let total = 0;
		for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
			const marked: number = await ctx.runMutation(internal.expiry.expireBatch, {
				now,
				limit: BATCH,
			});
			total += marked;
			if (marked < BATCH) break;
		}
		return total;
	},
});
