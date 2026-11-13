import { v } from "convex/values";
import { CHANGE_KINDS, CHANGE_LOG_DAYS, CHANGES_PAGE } from "../src/clinic/changes";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, query } from "./_generated/server";
import { requireServer } from "./guard";
import { serverKeyValidator } from "./validators";

const kindValidator = v.union(...CHANGE_KINDS.map((k) => v.literal(k)));
const DAY_MS = 86_400_000;

/**
 * The live change feed of an app. A reader keeps the cursor it was given (0 to start) and asks for
 * what came after it; subscribed with `ConvexClient.onUpdate` the query re-runs whenever the app's
 * log grows. Entries carry no content. `kinds` narrows to what the reader shows. The log is kept
 * 7 days: a cursor older than that gets everything still kept, so the reader should reload.
 */
export const since = query({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		cursor: v.number(),
		kinds: v.optional(v.array(kindValidator)),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const limit = Math.max(1, Math.min(CHANGES_PAGE, Math.floor(args.limit ?? CHANGES_PAGE)));
		const wanted = args.kinds === undefined ? undefined : new Set<string>(args.kinds);
		const found: Array<{ kind: string; entityId: string; at: number; version: number }> = [];
		let cursor = args.cursor;
		let hasMore = false;
		const rows = ctx.db
			.query("changeLog")
			.withIndex("by_tenant", (q) => q.eq("tenant", args.tenant).gt("_creationTime", args.cursor));
		for await (const row of rows) {
			if (found.length >= limit) {
				hasMore = true;
				break;
			}
			cursor = row._creationTime;
			if (wanted !== undefined && !wanted.has(row.kind)) continue;
			found.push({ kind: row.kind, entityId: row.entityId, at: row.at, version: row.version });
		}
		return { changes: found, cursor, hasMore };
	},
});

/** Deletes log entries older than the retention, a page at a time; the daily job loops until none are left. */
export const purgePage = internalMutation({
	args: { now: v.number(), tenant: v.optional(v.string()) },
	returns: v.object({ deleted: v.number(), more: v.boolean() }),
	handler: async (ctx, { now, tenant }) => {
		const cutoff = now - CHANGE_LOG_DAYS * DAY_MS;
		const old = await ctx.db
			.query("changeLog")
			.withIndex("by_at", (q) => q.lt("at", cutoff))
			.filter((q) => (tenant === undefined ? true : q.eq(q.field("tenant"), tenant)))
			.take(500);
		for (const row of old) await ctx.db.delete(row._id);
		return { deleted: old.length, more: old.length === 500 };
	},
});

export const purge = internalAction({
	args: {},
	handler: async (ctx): Promise<void> => {
		const now = Date.now();
		for (let i = 0; i < 200; i += 1) {
			const r: { deleted: number; more: boolean } = await ctx.runMutation(
				internal.changes.purgePage,
				{ now },
			);
			if (!r.more) return;
		}
	},
});
