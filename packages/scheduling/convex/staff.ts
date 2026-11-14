import { v } from "convex/values";
import { ruleProblem } from "../src/domain/catalog";
import { keepsReason, transition } from "../src/domain/lifecycle";
import { DAY_MINUTES, isLocalDate, MINUTE_MS } from "../src/domain/time";
import { mutation, query } from "./_generated/server";
import { appointmentByReference } from "./calendar";
import { requireServer } from "./guard";
import { moveAppointment } from "./move";
import {
	actorValidator,
	decisionReasonValidator,
	modeValidator,
	serverKeyValidator,
} from "./validators";

/**
 * The team's side. The app calls these only after OpenFGA allowed the signed-in staff member on
 * that calendar (`account.can("editor", …)` on `psizone_booking_request` or `psizone_calendar`, plan §5); Convex
 * keeps the subject it was given as `decidedBy`.
 */

const MAX_CALENDAR_MS = 62 * DAY_MINUTES * MINUTE_MS;

/** One practitioner's appointments in [from, to), contact included: for staff only. */
export const calendar = query({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		practitioner: v.string(),
		from: v.number(),
		to: v.number(),
		actor: actorValidator,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const id = ctx.db.normalizeId("practitioners", args.practitioner);
		const practitioner = id === null ? null : await ctx.db.get(id);
		if (practitioner === null || practitioner.tenant !== args.tenant) {
			return { ok: false as const, reason: "not_found" as const };
		}
		const to = Math.min(args.to, args.from + MAX_CALENDAR_MS);
		const rows = await ctx.db
			.query("appointments")
			.withIndex("by_practitioner_start", (q) =>
				q.eq("practitioner", practitioner._id).gte("start", args.from).lt("start", to),
			)
			.collect();
		return {
			ok: true as const,
			appointments: rows
				.filter((row) => row.status !== "held" && row.status !== "expired")
				.map((row) => ({
					reference: row.reference,
					status: row.status,
					start: row.start,
					end: row.end,
					mode: row.mode,
					...(row.contact === undefined ? {} : { contact: row.contact }),
					...(row.audience === undefined ? {} : { audience: row.audience }),
				})),
		};
	},
});

/**
 * Confirm, decline or cancel a request or appointment. A decline or a cancel may carry a reason
 * from the closed list (never free text); a confirm keeps none. The answer carries the start and,
 * for a request a signed-in person made, its account hash, so the app can notify that account.
 */
export const decide = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		reference: v.string(),
		decision: v.union(v.literal("confirm"), v.literal("decline"), v.literal("cancel")),
		reason: v.optional(decisionReasonValidator),
		actor: actorValidator,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await appointmentByReference(ctx, args.reference);
		if (row === undefined || row.tenant !== args.tenant) {
			return { ok: false as const, reason: "not_found" as const };
		}
		const now = Date.now();
		const next = transition(row, { type: args.decision }, now);
		if (!next.ok) return { ok: false as const, reason: next.reason };
		await ctx.db.patch(row._id, {
			status: next.next,
			decidedBy: args.actor.subject,
			decisionReason: keepsReason(args.decision) ? args.reason : undefined,
			updatedAt: now,
		});
		return {
			ok: true as const,
			status: next.next,
			reference: row.reference,
			start: row.start,
			...(row.accountHash === undefined ? {} : { accountHash: row.accountHash }),
		};
	},
});

/**
 * Move a request or appointment to another start, in one transaction: the new time is checked
 * as a hold would be (its own old block ignored), the new appointment keeps the contact and the
 * status, and the old one is cancelled and linked to it.
 */
export const reschedule = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		reference: v.string(),
		start: v.number(),
		mode: modeValidator,
		newReference: v.string(),
		actor: actorValidator,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await appointmentByReference(ctx, args.reference);
		if (row === undefined) return { ok: false as const, reason: "not_found" as const };
		return moveAppointment(ctx, row, {
			tenant: args.tenant,
			start: args.start,
			mode: args.mode,
			newReference: args.newReference,
			actor: args.actor.subject,
		});
	},
});

/** Close a day (or part of it) or open an extra window, for one practitioner. */
export const addException = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		practitioner: v.string(),
		date: v.string(),
		kind: v.union(v.literal("closed"), v.literal("open")),
		start: v.optional(v.number()),
		end: v.optional(v.number()),
		modes: v.optional(v.array(modeValidator)),
		actor: actorValidator,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const id = ctx.db.normalizeId("practitioners", args.practitioner);
		const practitioner = id === null ? null : await ctx.db.get(id);
		if (practitioner === null || practitioner.tenant !== args.tenant || !isLocalDate(args.date)) {
			return { ok: false as const, reason: "invalid" as const };
		}
		const timed = args.start !== undefined || args.end !== undefined;
		const window = {
			weekday: 1,
			start: args.start ?? 0,
			end: args.end ?? 0,
			modes: args.modes ?? ["onsite"],
		};
		if ((args.kind === "open" || timed) && ruleProblem(window) !== undefined) {
			return { ok: false as const, reason: "invalid" as const };
		}
		await ctx.db.insert("exceptions", {
			practitioner: practitioner._id,
			date: args.date,
			kind: args.kind,
			...(args.start === undefined ? {} : { start: args.start }),
			...(args.end === undefined ? {} : { end: args.end }),
			...(args.modes === undefined ? {} : { modes: args.modes }),
		});
		return { ok: true as const };
	},
});
