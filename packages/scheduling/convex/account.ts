import { v } from "convex/values";
import { transition } from "../src/domain/lifecycle";
import { mutation, query } from "./_generated/server";
import { appointmentByReference } from "./calendar";
import { requireServer, sameSecret } from "./guard";
import { serverKeyValidator } from "./validators";

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
			.withIndex("by_account_start", (q) =>
				q.eq("accountHash", args.accountHash),
			)
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
				practitionerName: practitioner?.displayName ?? "",
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

/** Cancels an upcoming request of this account (the app has already asked OpenFGA). */
export const cancelForAccount = mutation({
	args: {
		key: serverKeyValidator,
		reference: v.string(),
		accountHash: v.string(),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await appointmentByReference(ctx, args.reference);
		if (
			row === undefined ||
			row.accountHash === undefined ||
			!SHA256_HEX.test(args.accountHash) ||
			!sameSecret(row.accountHash, args.accountHash)
		) {
			return { ok: false as const, reason: "not_found" as const };
		}
		const now = Date.now();
		if (row.end <= now)
			return { ok: false as const, reason: "not_allowed" as const };
		const next = transition(row, { type: "cancel" }, now);
		if (!next.ok) return { ok: false as const, reason: next.reason };
		await ctx.db.patch(row._id, { status: next.next, updatedAt: now });
		return { ok: true as const, status: next.next, start: row.start };
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
		if (
			row.accountHash !== undefined &&
			!sameSecret(row.accountHash, args.accountHash)
		) {
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
			.withIndex("by_account_start", (q) =>
				q.eq("accountHash", args.accountHash),
			)
			.collect();
		const now = Date.now();
		for (const row of rows)
			await ctx.db.patch(row._id, { accountHash: undefined, updatedAt: now });
		return { ok: true as const, unlinked: rows.length };
	},
});
