import { v } from "convex/values";
import {
	deriveLinkKey,
	LINK_TTL_DEFAULT_HOURS,
	newLinkId,
	signLink,
	ttlAllowed,
	verifyLink,
} from "../src/clinic/feedback-link";
import type { Doc } from "./_generated/dataModel";
import { mutation, type QueryCtx, query } from "./_generated/server";
import { owned, REFUSED, record } from "./apiSupport";
import { itemArgs, makeFeedback, ratable } from "./feedbackSupport";
import { requireServer, SERVER_KEY_ENV } from "./guard";
import { actorValidator, serverKeyValidator } from "./validators";

/**
 * One-time feedback links (src/clinic/feedback-link.ts). The notify layer (which holds the server
 * key) calls `issue` when it sends the post-appointment e-mail and puts the token in the link;
 * the feedback page calls `inspect` to show the form and `redeem` to submit. A link works once,
 * for one appointment of one app, until it expires. Redeeming stores the feedback and marks the
 * link used in ONE transaction, so two submissions racing for one link store one.
 */
const HOUR_MS = 3_600_000;
const SYSTEM = "system:feedback-link";

async function linkKey(): Promise<CryptoKey> {
	return deriveLinkKey(process.env[SERVER_KEY_ENV] ?? "");
}

async function subjectOf(
	ctx: QueryCtx,
	tenant: string,
	kind: "visit" | "appointment",
	id: string,
): Promise<Doc<"visits"> | Doc<"appointments"> | null> {
	if (kind === "visit") return owned(ctx, "visits", tenant, id);
	const normal = ctx.db.normalizeId("appointments", id);
	const row = normal === null ? null : await ctx.db.get(normal);
	return row !== null && row.tenant === tenant ? row : null;
}

export const issue = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		visit: v.optional(v.string()),
		appointment: v.optional(v.string()),
		ttlHours: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		if ((args.visit === undefined) === (args.appointment === undefined)) return REFUSED("invalid");
		const ttl = args.ttlHours ?? LINK_TTL_DEFAULT_HOURS;
		if (!ttlAllowed(ttl)) return REFUSED("invalid_ttl");
		const kind = args.visit === undefined ? "appointment" : "visit";
		const subject = await subjectOf(ctx, args.tenant, kind, args.visit ?? args.appointment ?? "");
		if (subject === null) return REFUSED("not_found");
		const now = Date.now();
		if (!ratable(subject, now)) return REFUSED("not_eligible");
		const jti = newLinkId();
		const expiresAt = now + ttl * HOUR_MS;
		const token = await signLink(await linkKey(), {
			a: args.tenant,
			j: jti,
			k: kind,
			s: subject._id,
			e: expiresAt,
		});
		const id = await ctx.db.insert("feedbackLinks", {
			tenant: args.tenant,
			jti,
			subjectKind: kind,
			subject: subject._id,
			expiresAt,
			createdAt: now,
			createdBy: args.actor.subject,
		});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "feedback.link",
			entity: "feedback",
			entityId: id,
			kind: "feedback",
			version: 1,
		});
		return { ok: true as const, token, expiresAt };
	},
});

type Opened =
	| { ok: true; link: Doc<"feedbackLinks">; subject: Doc<"visits"> | Doc<"appointments"> }
	| { ok: false; reason: "invalid_link" | "expired" | "used" | "wrong_app" | "subject_gone" };

async function open(ctx: QueryCtx, tenant: string, token: string, now: number): Promise<Opened> {
	const verified = await verifyLink(await linkKey(), token, now);
	if (!verified.ok) {
		return { ok: false, reason: verified.reason === "expired" ? "expired" : "invalid_link" };
	}
	const { claims } = verified;
	if (claims.a !== tenant) return { ok: false, reason: "wrong_app" };
	const link = await ctx.db
		.query("feedbackLinks")
		.withIndex("by_tenant_jti", (q) => q.eq("tenant", tenant).eq("jti", claims.j))
		.unique();
	if (link === null || link.subject !== claims.s || link.subjectKind !== claims.k) {
		return { ok: false, reason: "invalid_link" };
	}
	if (link.usedAt !== undefined) return { ok: false, reason: "used" };
	const subject = await subjectOf(ctx, tenant, claims.k, claims.s);
	if (subject === null) return { ok: false, reason: "subject_gone" };
	if ("client" in subject && subject.client !== undefined) {
		const client = await ctx.db.get(subject.client);
		if (client === null || client.erasedAt !== undefined)
			return { ok: false, reason: "subject_gone" };
	}
	return { ok: true, link, subject };
}

/** Whether a link can still be used, and for when: what the feedback page shows. Writes nothing. */
export const inspect = query({
	args: { key: serverKeyValidator, tenant: v.string(), token: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const opened = await open(ctx, args.tenant, args.token, Date.now());
		return opened.ok
			? {
					ok: true as const,
					start: opened.subject.start,
					expiresAt: opened.link.expiresAt,
				}
			: REFUSED(opened.reason);
	},
});

export const redeem = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		token: v.string(),
		rating: itemArgs.rating,
		textEnc: itemArgs.textEnc,
		consentContact: itemArgs.consentContact,
		contact: itemArgs.contact,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const now = Date.now();
		const opened = await open(ctx, args.tenant, args.token, now);
		if (!opened.ok) return REFUSED(opened.reason);
		const { subject } = opened;
		const isVisit = opened.link.subjectKind === "visit";
		const made = await makeFeedback(
			ctx,
			args.tenant,
			{
				kind: "appointment_rating",
				rating: args.rating,
				textEnc: args.textEnc,
				consentContact: args.consentContact,
				contact: args.contact,
				...(isVisit ? { visit: subject._id } : { appointment: subject._id }),
			},
			"email_link",
			{ actor: SYSTEM },
			now,
			// The signed link already named the subject: no second lookup by a typed value.
			isVisit && "durationMinutes" in subject
				? { visit: subject }
				: "reference" in subject
					? { appointment: subject }
					: {},
		);
		if (!made.ok) {
			return {
				...REFUSED(made.reason),
				...(made.problems === undefined ? {} : { problems: made.problems }),
			};
		}
		await ctx.db.patch(opened.link._id, { usedAt: now, feedback: made.id });
		return { ok: true as const, id: made.id };
	},
});
