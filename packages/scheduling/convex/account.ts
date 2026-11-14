import { v } from "convex/values";
import { transition } from "../src/domain/lifecycle";
import { MINUTE_MS } from "../src/domain/time";
import type { Doc } from "./_generated/dataModel";
import { type MutationCtx, mutation, query } from "./_generated/server";
import { appointmentByReference } from "./calendar";
import { requireServer, sameSecret } from "./guard";
import { moveAppointment } from "./move";
import { modeValidator, serverKeyValidator } from "./validators";

/**
 * A signed-in person's own requests (docs/plans/accounts.md, "Previous reservations"). The app decides
 * first — an OpenFGA Check on `psizone_booking_request:<reference>` with the row's account as contextual
 * owner — and every function here checks the account hash again inside the transaction, so a row is never
 * read or changed for an account it does not belong to.
 *
 * An anonymous request is linked to an account only with proof: its reference AND its cancel code
 * (`link`), sent by a signed-in person. Nothing is ever linked by name, e-mail or phone.
 */

const SHA256_HEX = /^[0-9a-f]{64}$/;
/** What a person sees of their own history: held and expired rows never left the booking form. */
const LISTED = new Set(["requested", "confirmed", "cancelled", "declined"]);
const LIMIT = 100;

export const forAccount = query({
	args: { key: serverKeyValidator, accountHash: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (!SHA256_HEX.test(args.accountHash))
			return { ok: false as const, reason: "invalid" as const };
		const rows = await ctx.db
			.query("appointments")
			.withIndex("by_account_start", (q) => q.eq("accountHash", args.accountHash))
			.order("desc")
			.take(LIMIT);
		const out = [];
		for (const row of rows) {
			if (!LISTED.has(row.status)) continue;
			const [service, practitioner] = await Promise.all([
				ctx.db.get(row.service),
				ctx.db.get(row.practitioner),
			]);
			out.push({
				reference: row.reference,
				tenant: row.tenant,
				service: service?.slug ?? "",
				practitioner: row.practitioner,
				practitionerName: practitioner?.displayName ?? "",
				minNoticeMinutes: service?.minNoticeMinutes ?? 0,
				status: row.status,
				mode: row.mode,
				start: row.start,
				end: row.end,
				channel: row.channel,
				submittedAt: row.submittedAt ?? row.updatedAt,
			});
		}
		return { ok: true as const, requests: out };
	},
});

/** The account's own row, or undefined: the hash is checked inside the transaction, never trusted from outside. */
async function ownRow(ctx: MutationCtx, reference: string, accountHash: string) {
	const row = await appointmentByReference(ctx, reference);
	return row === undefined ||
		row.accountHash === undefined ||
		!SHA256_HEX.test(accountHash) ||
		!sameSecret(row.accountHash, accountHash)
		? undefined
		: row;
}

/**
 * The clinic's rule for changing a booking online: until the service's notice before it starts (the same notice a
 * booking needs). Later, the visitor calls the clinic.
 */
async function tooLate(ctx: MutationCtx, row: Doc<"appointments">, now: number): Promise<boolean> {
	const service = await ctx.db.get(row.service);
	return now >= row.start - (service?.minNoticeMinutes ?? 0) * MINUTE_MS;
}

/** Cancels an upcoming request of this account (the app has already asked OpenFGA). */
export const cancelForAccount = mutation({
	args: {
		key: serverKeyValidator,
		reference: v.string(),
		accountHash: v.string(),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await ownRow(ctx, args.reference, args.accountHash);
		if (row === undefined) return { ok: false as const, reason: "not_found" as const };
		const now = Date.now();
		if (row.end <= now || (await tooLate(ctx, row, now)))
			return { ok: false as const, reason: "not_allowed" as const };
		const next = transition(row, { type: "cancel" }, now);
		if (!next.ok) return { ok: false as const, reason: next.reason };
		await ctx.db.patch(row._id, { status: next.next, updatedAt: now });
		return { ok: true as const, status: next.next, start: row.start };
	},
});

/**
 * Moves an upcoming request of this account to another free time of the same person and service (the clinic's rule
 * as for a cancel): a new request with a new reference, the old one cancelled and linked to it, in one transaction.
 */
export const rescheduleForAccount = mutation({
	args: {
		key: serverKeyValidator,
		reference: v.string(),
		accountHash: v.string(),
		start: v.number(),
		mode: modeValidator,
		newReference: v.string(),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await ownRow(ctx, args.reference, args.accountHash);
		if (row === undefined) return { ok: false as const, reason: "not_found" as const };
		if (await tooLate(ctx, row, Date.now()))
			return { ok: false as const, reason: "not_allowed" as const };
		return moveAppointment(ctx, row, {
			tenant: row.tenant,
			start: args.start,
			mode: args.mode,
			newReference: args.newReference,
			actor: `account:${args.accountHash.slice(0, 12)}`,
		});
	},
});

/** Links an anonymous request to an account, with its proof: the reference and the cancel code. */
export const link = mutation({
	args: {
		key: serverKeyValidator,
		reference: v.string(),
		cancelCodeHash: v.string(),
		accountHash: v.string(),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await appointmentByReference(ctx, args.reference);
		const stored = row?.cancelCodeHash;
		if (
			row === undefined ||
			stored === undefined ||
			!SHA256_HEX.test(args.accountHash) ||
			!sameSecret(stored, args.cancelCodeHash)
		) {
			return { ok: false as const, reason: "not_found" as const };
		}
		if (row.accountHash !== undefined && !sameSecret(row.accountHash, args.accountHash)) {
			return { ok: false as const, reason: "not_found" as const };
		}
		await ctx.db.patch(row._id, {
			accountHash: args.accountHash,
			updatedAt: Date.now(),
		});
		return { ok: true as const, reference: row.reference };
	},
});

/** Erasure of an account: its requests are kept (the clinic's records) but no longer tied to it. */
export const unlink = mutation({
	args: { key: serverKeyValidator, accountHash: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (!SHA256_HEX.test(args.accountHash))
			return { ok: false as const, reason: "invalid" as const };
		const rows = await ctx.db
			.query("appointments")
			.withIndex("by_account_start", (q) => q.eq("accountHash", args.accountHash))
			.collect();
		const now = Date.now();
		for (const row of rows) await ctx.db.patch(row._id, { accountHash: undefined, updatedAt: now });
		return { ok: true as const, unlinked: rows.length };
	},
});
