import { transition } from "../src/domain/lifecycle";
import { isOffered } from "../src/domain/slots";
import { MINUTE_MS } from "../src/domain/time";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
	appointmentByReference,
	busyAround,
	exceptionsOf,
	rulesOf,
	serviceSpec,
	tenantBySlug,
} from "./calendar";
import { roomFor, roomPlan } from "./roomPlan";

export type MoveResult =
	| { ok: true; reference: string; start: number; end: number }
	| {
			ok: false;
			reason: "not_found" | "slot_taken" | "retry" | "not_allowed" | "hold_expired";
	  };

/**
 * Moves a request or appointment to another start, in the caller's transaction: the new time is checked as a hold
 * would be (its own old block ignored), the new appointment keeps the contact and the status, and the old one is
 * cancelled and linked to it. The team's reschedule and a signed-in visitor's own both go through here.
 */
export async function moveAppointment(
	ctx: MutationCtx,
	row: Doc<"appointments">,
	input: {
		tenant: string;
		start: number;
		mode: "onsite" | "online";
		newReference: string;
		actor: string;
	},
): Promise<MoveResult> {
	const tenant = await tenantBySlug(ctx, input.tenant);
	const service = await ctx.db.get(row.service);
	if (tenant === undefined || service === null || row.tenant !== tenant.slug)
		return { ok: false, reason: "not_found" };
	const now = Date.now();
	const leave = transition(row, { type: "reschedule" }, now);
	if (!leave.ok) return { ok: false, reason: leave.reason };
	if ((await appointmentByReference(ctx, input.newReference)) !== undefined)
		return { ok: false, reason: "retry" };
	const spec = serviceSpec(service);
	const end = input.start + spec.durationMinutes * MINUTE_MS;
	const blockedUntil = end + spec.bufferMinutes * MINUTE_MS;
	const [rules, exceptions, busy] = await Promise.all([
		rulesOf(ctx, row.practitioner),
		exceptionsOf(ctx, row.practitioner, input.start, blockedUntil, tenant.timeZone),
		busyAround(ctx, row.practitioner, input.start, blockedUntil, now, row._id),
	]);
	const person = await ctx.db.get(row.practitioner);
	const calendar = {
		timeZone: tenant.timeZone,
		service: spec,
		rules,
		exceptions,
		busy,
		now,
		...(person?.abAnchor === undefined ? {} : { abAnchor: person.abAnchor }),
	};
	if (!isOffered(calendar, input.start, input.mode)) return { ok: false, reason: "slot_taken" };
	const plan =
		input.mode === "onsite" && person !== null
			? await roomPlan(ctx, tenant, service, person, {
					from: input.start,
					to: blockedUntil,
					now,
					except: row._id,
				})
			: undefined;
	const room = plan === undefined ? undefined : roomFor(plan, input.start, blockedUntil);
	if (plan !== undefined && room === undefined) return { ok: false, reason: "slot_taken" };
	const { _id, _creationTime, decisionReason: _reason, room: _oldRoom, ...kept } = row;
	const moved = await ctx.db.insert("appointments", {
		...kept,
		...(room === undefined ? {} : { room: ctx.db.normalizeId("rooms", room.id) ?? undefined }),
		mode: input.mode,
		start: input.start,
		end,
		blockedUntil,
		reference: input.newReference,
		rescheduledFrom: _id,
		decidedBy: input.actor,
		updatedAt: now,
	});
	await ctx.db.patch(_id, {
		status: leave.next,
		decisionReason: undefined,
		rescheduledTo: moved,
		decidedBy: input.actor,
		updatedAt: now,
	});
	return { ok: true, reference: input.newReference, start: input.start, end };
}
