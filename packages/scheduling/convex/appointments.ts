import { v } from "convex/values";
import { cleanContact, contactProblem } from "../src/domain/contact";
import { transition } from "../src/domain/lifecycle";
import { isOffered } from "../src/domain/slots";
import { MINUTE_MS } from "../src/domain/time";
import { mutation } from "./_generated/server";
import {
	appointmentByReference,
	busyAround,
	exceptionsOf,
	rulesOf,
	serviceBySlug,
	serviceSpec,
	tenantBySlug,
} from "./calendar";
import { requireServer, sameSecret } from "./guard";
import { roomFor, roomPlan } from "./roomPlan";
import {
	audienceValidator,
	channelValidator,
	contactValidator,
	localeValidator,
	modeValidator,
	serverKeyValidator,
} from "./validators";

const SHA256_HEX = /^[0-9a-f]{64}$/;
const REFERENCE = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

/**
 * Holds one slot for a visitor: no personal data yet, only the slot, a reference and the hash of
 * the token the confirm form carries. Everything is re-checked here, inside the transaction:
 * the slot must be one the rules offer right now, and nothing blocking may overlap it. Two holds
 * racing for the same time read the same index range, so Convex commits one and retries the
 * other, which then sees the first and answers `slot_taken`.
 */
export const hold = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		service: v.string(),
		practitioner: v.string(),
		start: v.number(),
		mode: modeValidator,
		reference: v.string(),
		holdTokenHash: v.string(),
		locale: localeValidator,
		channel: channelValidator,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (!SHA256_HEX.test(args.holdTokenHash) || !REFERENCE.test(args.reference)) {
			return { ok: false as const, reason: "invalid" as const };
		}
		const tenant = await tenantBySlug(ctx, args.tenant);
		const service =
			tenant === undefined ? undefined : await serviceBySlug(ctx, tenant.slug, args.service);
		const practitionerId = ctx.db.normalizeId("practitioners", args.practitioner);
		if (tenant === undefined || service === undefined || practitionerId === null) {
			return { ok: false as const, reason: "unknown_service" as const };
		}
		const practitioner = await ctx.db.get(practitionerId);
		if (
			practitioner === null ||
			!practitioner.active ||
			!service.practitioners.includes(practitionerId)
		) {
			return { ok: false as const, reason: "unknown_service" as const };
		}
		const now = Date.now();
		const spec = serviceSpec(service);
		const end = args.start + spec.durationMinutes * MINUTE_MS;
		const blockedUntil = end + spec.bufferMinutes * MINUTE_MS;
		const [rules, exceptions, busy] = await Promise.all([
			rulesOf(ctx, practitionerId),
			exceptionsOf(ctx, practitionerId, args.start, blockedUntil, tenant.timeZone),
			busyAround(ctx, practitionerId, args.start, blockedUntil, now),
		]);
		const calendar = {
			timeZone: tenant.timeZone,
			service: spec,
			rules,
			exceptions,
			busy,
			now,
			...(practitioner.abAnchor === undefined ? {} : { abAnchor: practitioner.abAnchor }),
		};
		if (!isOffered(calendar, args.start, args.mode)) {
			const free = isOffered({ ...calendar, busy: [] }, args.start, args.mode);
			return {
				ok: false as const,
				reason: free ? ("slot_taken" as const) : ("not_offered" as const),
			};
		}
		// An onsite session also needs a suitable room, free for the same span (read here, so a
		// race for the last room conflicts and one of the two retries into `slot_taken`).
		const plan =
			args.mode === "onsite"
				? await roomPlan(ctx, tenant, service, practitioner, {
						from: args.start,
						to: blockedUntil,
						now,
					})
				: undefined;
		const room = plan === undefined ? undefined : roomFor(plan, args.start, blockedUntil);
		if (plan !== undefined && room === undefined) {
			return { ok: false as const, reason: "slot_taken" as const };
		}
		if ((await appointmentByReference(ctx, args.reference)) !== undefined) {
			return { ok: false as const, reason: "retry" as const };
		}
		const holdExpiresAt = now + spec.holdMinutes * MINUTE_MS;
		await ctx.db.insert("appointments", {
			tenant: tenant.slug,
			practitioner: practitionerId,
			service: service._id,
			...(room === undefined ? {} : { room: ctx.db.normalizeId("rooms", room.id) ?? undefined }),
			mode: args.mode,
			start: args.start,
			end,
			blockedUntil,
			status: "held",
			reference: args.reference,
			holdExpiresAt,
			holdTokenHash: args.holdTokenHash,
			locale: args.locale,
			channel: args.channel,
			updatedAt: now,
		});
		return {
			ok: true as const,
			reference: args.reference,
			start: args.start,
			end,
			mode: args.mode,
			expiresAt: holdExpiresAt,
			practitionerName: practitioner.displayName,
			timeZone: tenant.timeZone,
		};
	},
});

/**
 * The visitor confirms their hold: it becomes a request, with the contact they typed into the
 * booking form. Refused once the hold has lapsed, even before the sweep marks it.
 */
export const submit = mutation({
	args: {
		key: serverKeyValidator,
		reference: v.string(),
		holdTokenHash: v.string(),
		cancelCodeHash: v.string(),
		contact: contactValidator,
		audience: v.optional(audienceValidator),
		/** The signed-in visitor's account hash (see the schema); absent for an anonymous request. */
		accountHash: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (
			!SHA256_HEX.test(args.cancelCodeHash) ||
			contactProblem(args.contact) !== undefined ||
			(args.accountHash !== undefined && !SHA256_HEX.test(args.accountHash))
		) {
			return { ok: false as const, reason: "invalid" as const };
		}
		const row = await appointmentByReference(ctx, args.reference);
		if (row === undefined || !sameSecret(row.holdTokenHash, args.holdTokenHash)) {
			return { ok: false as const, reason: "not_found" as const };
		}
		const now = Date.now();
		const next = transition(row, { type: "submit" }, now);
		if (!next.ok) return { ok: false as const, reason: next.reason };
		await ctx.db.patch(row._id, {
			status: next.next,
			contact: cleanContact(args.contact),
			...(args.audience === undefined ? {} : { audience: args.audience }),
			...(args.accountHash === undefined ? {} : { accountHash: args.accountHash }),
			cancelCodeHash: args.cancelCodeHash,
			submittedAt: now,
			updatedAt: now,
		});
		const tenant = await tenantBySlug(ctx, row.tenant);
		return {
			ok: true as const,
			reference: row.reference,
			status: next.next,
			start: row.start,
			end: row.end,
			mode: row.mode,
			timeZone: tenant?.timeZone ?? "UTC",
		};
	},
});

/** The visitor lets go of a hold they no longer want (changing the time, say). */
export const release = mutation({
	args: { key: serverKeyValidator, reference: v.string(), holdTokenHash: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await appointmentByReference(ctx, args.reference);
		if (row === undefined || !sameSecret(row.holdTokenHash, args.holdTokenHash)) {
			return { ok: false as const, reason: "not_found" as const };
		}
		const now = Date.now();
		const next = transition(row, { type: "release" }, now);
		if (!next.ok) return { ok: false as const, reason: next.reason };
		await ctx.db.patch(row._id, { status: next.next, updatedAt: now });
		return { ok: true as const, status: next.next };
	},
});

/** The visitor cancels their request or appointment with the cancel code they were shown. */
export const cancel = mutation({
	args: { key: serverKeyValidator, reference: v.string(), cancelCodeHash: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await appointmentByReference(ctx, args.reference);
		const stored = row?.cancelCodeHash;
		if (row === undefined || stored === undefined || !sameSecret(stored, args.cancelCodeHash)) {
			return { ok: false as const, reason: "not_found" as const };
		}
		const now = Date.now();
		if (row.end <= now) return { ok: false as const, reason: "not_allowed" as const };
		const next = transition(row, { type: "cancel" }, now);
		if (!next.ok) return { ok: false as const, reason: next.reason };
		await ctx.db.patch(row._id, { status: next.next, updatedAt: now });
		return { ok: true as const, status: next.next, start: row.start };
	},
});
