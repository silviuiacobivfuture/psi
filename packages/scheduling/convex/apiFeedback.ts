import { v } from "convex/values";
import {
	CIPHERTEXT_MAX,
	type FeedbackEvent,
	type FeedbackStatus,
	nextStatus,
} from "../src/clinic/feedback";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { owned, REFUSED, record, stale } from "./apiSupport";
import { type Group, groupsValidator, itemArgs, makeFeedback } from "./feedbackSupport";
import { requireServer } from "./guard";
import { actorValidator, encryptedValidator, serverKeyValidator } from "./validators";

/**
 * Feedback for the staff API and for the places clients write it (their account, the chat). The
 * API checks who may do what; `groups` says which field groups the caller may see: `core` is the
 * rating, the text and the replies, `contact` is who wrote it and how to reach them. Without
 * either, an item is its kind, channel, status, dates and the ids it points at.
 */
const SHA256_HEX = /^[0-9a-f]{64}$/;
const SCAN = 2_000;

const shown = (row: Doc<"feedback">, groups: ReadonlyArray<Group>) => ({
	id: row._id,
	kind: row.kind,
	channel: row.channel,
	status: row.status,
	createdAt: row.createdAt,
	updatedAt: row.updatedAt,
	version: row.version,
	...(row.readAt === undefined ? {} : { readAt: row.readAt }),
	...(row.answeredAt === undefined ? {} : { answeredAt: row.answeredAt }),
	...(row.closedAt === undefined ? {} : { closedAt: row.closedAt }),
	...(row.visit === undefined ? {} : { visit: row.visit }),
	...(row.appointment === undefined ? {} : { appointment: row.appointment }),
	...(row.client === undefined ? {} : { client: row.client }),
	linkedAccount: row.accountHash !== undefined,
	...(groups.includes("core")
		? {
				...(row.rating === undefined ? {} : { rating: row.rating }),
				...(row.textEnc === undefined ? {} : { textEnc: row.textEnc }),
			}
		: {}),
	...(groups.includes("contact")
		? {
				consentContact: row.consentContact,
				...(row.contact === undefined ? {} : { contact: row.contact }),
				...(row.staffSubject === undefined ? {} : { staffSubject: row.staffSubject }),
			}
		: {}),
});

/**
 * Feedback written from an account, the chat or by staff. `email_link` is not a channel here: a
 * link is redeemed (`feedbackLinks.redeem`). An account item needs the account hash (the same
 * hash the booking flow keeps), a staff item needs the acting subject; chat may be anonymous.
 */
export const submit = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		channel: v.union(v.literal("account"), v.literal("chat"), v.literal("staff")),
		actor: v.optional(actorValidator),
		accountHash: v.optional(v.string()),
		...itemArgs,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const { key: _key, tenant, channel, actor, accountHash, ...item } = args;
		if (channel === "staff" && actor === undefined) return REFUSED("actor_required");
		if (channel === "account" && (accountHash === undefined || !SHA256_HEX.test(accountHash))) {
			return REFUSED("account_required");
		}
		if (accountHash !== undefined && !SHA256_HEX.test(accountHash)) return REFUSED("invalid");
		const made = await makeFeedback(
			ctx,
			tenant,
			item,
			channel,
			{
				...(accountHash === undefined ? {} : { accountHash }),
				...(channel === "staff" && actor !== undefined ? { staffSubject: actor.subject } : {}),
				actor: channel === "staff" && actor !== undefined ? actor.subject : `system:${channel}`,
			},
			Date.now(),
		);
		return made.ok
			? { ok: true as const, id: made.id }
			: {
					...REFUSED(made.reason),
					...(made.problems === undefined ? {} : { problems: made.problems }),
				};
	},
});

export const list = query({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		groups: groupsValidator,
		statuses: v.optional(v.array(v.string())),
		kind: v.optional(v.string()),
		channel: v.optional(v.string()),
		from: v.optional(v.number()),
		to: v.optional(v.number()),
		minRating: v.optional(v.number()),
		maxRating: v.optional(v.number()),
		before: v.optional(v.number()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const limit = Math.max(1, Math.min(200, Math.floor(args.limit ?? 50)));
		const upper = Math.min(
			args.before ?? Number.MAX_SAFE_INTEGER,
			args.to ?? Number.MAX_SAFE_INTEGER,
		);
		const rows = await ctx.db
			.query("feedback")
			.withIndex("by_tenant_created", (q) =>
				q
					.eq("tenant", args.tenant)
					.gte("createdAt", args.from ?? 0)
					.lt("createdAt", upper),
			)
			.order("desc")
			.take(SCAN);
		const wanted = args.statuses === undefined ? undefined : new Set(args.statuses);
		const matching = rows.filter(
			(r) =>
				(wanted === undefined || wanted.has(r.status)) &&
				(args.kind === undefined || r.kind === args.kind) &&
				(args.channel === undefined || r.channel === args.channel) &&
				(args.minRating === undefined || (r.rating !== undefined && r.rating >= args.minRating)) &&
				(args.maxRating === undefined || (r.rating !== undefined && r.rating <= args.maxRating)),
		);
		return {
			ok: true as const,
			items: matching.slice(0, limit).map((r) => shown(r, args.groups)),
			more: matching.length > limit,
		};
	},
});

export const get = query({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		feedback: v.string(),
		groups: groupsValidator,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "feedback", args.tenant, args.feedback);
		if (row === null) return REFUSED("not_found");
		const replies = args.groups.includes("core")
			? await ctx.db
					.query("feedbackReplies")
					.withIndex("by_tenant_feedback", (q) =>
						q.eq("tenant", args.tenant).eq("feedback", row._id),
					)
					.collect()
			: [];
		return {
			ok: true as const,
			item: shown(row, args.groups),
			replies: replies.map((r) => ({ id: r._id, by: r.by, at: r.at, textEnc: r.textEnc })),
		};
	},
});

async function move(
	ctx: Parameters<typeof owned>[0] & {
		db: { patch: (id: Doc<"feedback">["_id"], v: object) => Promise<void> };
	},
	row: Doc<"feedback">,
	event: FeedbackEvent,
	now: number,
): Promise<{ ok: true; next: FeedbackStatus; changed: boolean } | { ok: false; reason: string }> {
	const change = nextStatus(row.status, event);
	if (!change.ok) return change;
	if (change.changed) {
		await ctx.db.patch(row._id, {
			status: change.next,
			updatedAt: now,
			version: row.version + 1,
			...(change.next === "read" && event === "read" ? { readAt: now } : {}),
			...(change.next === "answered" ? { answeredAt: now } : {}),
			...(change.next === "closed" ? { closedAt: now } : {}),
			...(event === "reopen" ? { closedAt: undefined } : {}),
		});
	}
	return change;
}

/** A staff reply. The thread is append-only; replying marks the item answered, and a closed one refuses. */
export const reply = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		feedback: v.string(),
		textEnc: encryptedValidator,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "feedback", args.tenant, args.feedback);
		if (row === null) return REFUSED("not_found");
		if (args.textEnc.data.length > CIPHERTEXT_MAX) return REFUSED("too_long");
		const now = Date.now();
		const moved = await move(ctx, row, "reply", now);
		if (!moved.ok) return REFUSED(moved.reason);
		await ctx.db.insert("feedbackReplies", {
			tenant: args.tenant,
			feedback: row._id,
			by: args.actor.subject,
			textEnc: args.textEnc,
			at: now,
		});
		if (!moved.changed) await ctx.db.patch(row._id, { updatedAt: now, version: row.version + 1 });
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "feedback.reply",
			entity: "feedback",
			entityId: row._id,
			kind: "feedback",
			version: row.version + 1,
		});
		// Whether the notify layer may send the reply on: only with the author's consent.
		return { ok: true as const, status: moved.next, contactable: row.consentContact };
	},
});

/** Marks an item read, closes it, or reopens a closed one (to `read`). */
export const setStatus = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		feedback: v.string(),
		event: v.union(v.literal("read"), v.literal("close"), v.literal("reopen")),
		expectedVersion: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "feedback", args.tenant, args.feedback);
		if (row === null) return REFUSED("not_found");
		if (stale(row.version, args.expectedVersion)) return REFUSED("stale");
		const moved = await move(ctx, row, args.event, Date.now());
		if (!moved.ok) return REFUSED(moved.reason);
		if (!moved.changed) return { ok: true as const, changed: false as const, status: moved.next };
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "feedback.status",
			entity: "feedback",
			entityId: row._id,
			kind: "feedback",
			version: row.version + 1,
			fields: ["status"],
		});
		return { ok: true as const, changed: true as const, status: moved.next };
	},
});
