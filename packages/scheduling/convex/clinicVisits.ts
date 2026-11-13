import { v } from "convex/values";
import { makeAuditEvent } from "../src/clinic/audit";
import { columnKey, visitProblems } from "../src/clinic/visits";
import { overlaps } from "../src/domain/conflicts";
import { MINUTE_MS } from "../src/domain/time";
import { internalMutation } from "./_generated/server";
import { staffGate } from "./blacklistGate";
import { busyAround } from "./calendar";
import { logChange } from "./changeLog";
import { practitionerOf } from "./setupSupport";

/**
 * A staff-made visit on a practitioner's column. It refuses a time the practitioner already has
 * taken, whether by another visit or by the public flow (a hold, a request, a confirmed booking),
 * in the same transaction that writes it, so the two cannot race. The staff API will wrap this.
 */
export const create = internalMutation({
	args: {
		tenant: v.string(),
		practitioner: v.string(),
		client: v.optional(v.string()),
		/** A room the visit uses (it blocks the public flow's rooms too). */
		room: v.optional(v.string()),
		start: v.number(),
		end: v.number(),
		sessionType: v.string(),
		actor: v.string(),
	},
	returns: v.union(
		v.object({ ok: v.literal(true), id: v.string() }),
		v.object({ ok: v.literal(false), reason: v.string() }),
	),
	handler: async (ctx, args) => {
		const practitioner = await practitionerOf(ctx, args.tenant, args.practitioner);
		if (practitioner === undefined) return { ok: false as const, reason: "unknown_practitioner" };
		const clientId =
			args.client === undefined ? undefined : ctx.db.normalizeId("clients", args.client);
		const client = clientId === undefined || clientId === null ? null : await ctx.db.get(clientId);
		if (
			args.client !== undefined &&
			(client === null || client.tenant !== args.tenant || client.erasedAt !== undefined)
		) {
			return { ok: false as const, reason: "unknown_client" };
		}
		const roomId = args.room === undefined ? undefined : ctx.db.normalizeId("rooms", args.room);
		const room = roomId === undefined || roomId === null ? undefined : await ctx.db.get(roomId);
		if (
			args.room !== undefined &&
			(room === undefined || room === null || room.tenant !== args.tenant)
		) {
			return { ok: false as const, reason: "unknown_room" };
		}
		const problems = visitProblems({
			column: { kind: "practitioner", id: practitioner._id },
			...(client === null ? {} : { client: client._id }),
			start: args.start,
			end: args.end,
			durationMinutes: Math.round((args.end - args.start) / MINUTE_MS),
		});
		if (problems.length > 0) return { ok: false as const, reason: problems[0] ?? "invalid" };
		const now = Date.now();
		// An internal path (the staff API uses apiVisits.create) with no override: it refuses a client the blacklist names.
		const gate = await staffGate(ctx, args.tenant, client, undefined, now);
		if (gate.stop !== undefined) return { ok: false as const, reason: gate.stop.reason };
		const busy = await busyAround(ctx, practitioner._id, args.start, args.end, now);
		if (busy.some((b) => overlaps({ start: args.start, until: args.end }, b))) {
			return { ok: false as const, reason: "overlaps" };
		}
		const column = { kind: "practitioner" as const, id: practitioner._id };
		const id = await ctx.db.insert("visits", {
			tenant: args.tenant,
			client: client?._id,
			column,
			columnKey: columnKey(column),
			room: room?._id,
			start: args.start,
			end: args.end,
			durationMinutes: Math.round((args.end - args.start) / MINUTE_MS),
			sessionType: args.sessionType,
			status: "confirmed",
			attendance: "pending",
			reminderSent: false,
			clientConfirmed: false,
			createdBy: args.actor,
			createdAt: now,
			updatedAt: now,
			version: 1,
		});
		await logChange(ctx, args.tenant, "visit", id, 1);
		const event = makeAuditEvent({
			tenant: args.tenant,
			at: now,
			actor: args.actor,
			action: "visit.create",
			entity: "visit",
			entityId: id,
		});
		if (!event.ok) throw new Error(`audit event refused: ${event.problems.join(",")}`);
		await ctx.db.insert("auditEvents", {
			tenant: event.event.tenant,
			at: event.event.at,
			actor: event.event.actor,
			action: event.event.action,
			entity: event.event.entity,
			entityId: event.event.entityId,
			summary: event.event.summary,
		});
		return { ok: true as const, id };
	},
});
