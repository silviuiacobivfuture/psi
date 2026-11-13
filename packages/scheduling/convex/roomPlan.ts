import type { Audience, RoomNeed } from "../src/domain/catalog";
import { busyFrom } from "../src/domain/conflicts";
import { closureSpans, pickRoom, type RoomCalendar, type RoomSpec } from "../src/domain/rooms";
import { addDays, MINUTE_MS, toLocal } from "../src/domain/time";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { MAX_BLOCK_MS, visitBusyOnColumn } from "./calendar";

/**
 * Rooms inside slot search and holds. A service that names a room kind needs a suitable room, free
 * for the whole session and its buffer, for an onsite session; online sessions never need one. The
 * room's own calendar (appointments by `by_room_start`, the team's visits, closures) is read in the same transaction
 * as the practitioner's, so two holds racing for the last room conflict like two for one person.
 */

export interface RoomPlan {
	need: RoomNeed;
	rooms: ReadonlyArray<RoomCalendar>;
	/** Rooms this practitioner may use; empty means any. */
	allowed: ReadonlyArray<string>;
}

export function needOf(service: Doc<"services">): RoomNeed | undefined {
	if (service.roomKind === undefined) return undefined;
	return {
		kind: service.roomKind,
		equipment: service.roomEquipment ?? [],
		audiences: (service.roomAudiences ?? []) as ReadonlyArray<Audience>,
	};
}

function specOf(room: Doc<"rooms">): RoomSpec {
	return {
		id: room._id,
		kind: room.kind,
		capacity: room.capacity,
		suits: room.suits,
		equipment: room.equipment,
	};
}

/** The rooms' calendars over [from, to) for this service and practitioner, or undefined: no room needed. */
export async function roomPlan(
	ctx: QueryCtx,
	tenant: Doc<"tenants">,
	service: Doc<"services">,
	practitioner: Doc<"practitioners">,
	range: { from: number; to: number; now: number; except?: Id<"appointments"> },
): Promise<RoomPlan | undefined> {
	const need = needOf(service);
	if (need === undefined) return undefined;
	const rows = (
		await ctx.db
			.query("rooms")
			.withIndex("by_tenant_slug", (q) => q.eq("tenant", tenant.slug))
			.collect()
	).filter((r) => r.active);
	const first = addDays(toLocal(range.from, tenant.timeZone).date, -1);
	const last = addDays(toLocal(range.to, tenant.timeZone).date, 1);
	const rooms: RoomCalendar[] = [];
	for (const row of rows) {
		const [booked, closures, visitsInColumn, visitsUsingIt] = await Promise.all([
			ctx.db
				.query("appointments")
				.withIndex("by_room_start", (q) =>
					q
						.eq("room", row._id)
						.gte("start", range.from - MAX_BLOCK_MS)
						.lt("start", range.to),
				)
				.collect(),
			ctx.db
				.query("roomClosures")
				.withIndex("by_room_date", (q) =>
					q.eq("room", row._id).gte("date", first).lte("date", last),
				)
				.collect(),
			// The team's own visits: in this room's column, or using it besides their column.
			visitBusyOnColumn(ctx, tenant.slug, `room:${row._id}`, range.from, range.to, range.now),
			ctx.db
				.query("visits")
				.withIndex("by_tenant_room_start", (q) =>
					q
						.eq("tenant", tenant.slug)
						.eq("room", row._id)
						.gte("start", range.from - MAX_BLOCK_MS)
						.lt("start", range.to),
				)
				.collect(),
		]);
		const busy = busyFrom(
			booked
				.filter((a) => a._id !== range.except)
				.map((a) => ({
					status: a.status,
					start: a.start,
					blockedUntil: a.blockedUntil,
					...(a.holdExpiresAt === undefined ? {} : { holdExpiresAt: a.holdExpiresAt }),
				})),
			range.now,
		);
		rooms.push({
			room: specOf(row),
			busy: [
				...busy,
				...visitsInColumn,
				...busyFrom(
					visitsUsingIt.map((v) => ({ status: v.status, start: v.start, blockedUntil: v.end })),
					range.now,
				),
				...closureSpans(
					closures.map((c) => ({
						date: c.date,
						...(c.start === undefined ? {} : { start: c.start }),
						...(c.end === undefined ? {} : { end: c.end }),
					})),
					tenant.timeZone,
				),
			],
		});
	}
	rooms.sort((a, b) => a.room.id.localeCompare(b.room.id));
	return { need, rooms, allowed: practitioner.rooms ?? [] };
}

/** The room an onsite session over [start, blockedUntil) would use, if one is free. */
export function roomFor(plan: RoomPlan, start: number, blockedUntil: number): RoomSpec | undefined {
	return pickRoom(plan.rooms, plan.need, { start, until: blockedUntil }, plan.allowed);
}

/** Slots with the onsite mode taken off where no room is free; a slot with no mode left goes. */
export function withRooms<S extends { start: number; modes: ReadonlyArray<"onsite" | "online"> }>(
	slots: ReadonlyArray<S>,
	plan: RoomPlan | undefined,
	blockMinutes: number,
): ReadonlyArray<S> {
	if (plan === undefined) return slots;
	return slots.flatMap((slot) => {
		if (!slot.modes.includes("onsite")) return [slot];
		const free = roomFor(plan, slot.start, slot.start + blockMinutes * MINUTE_MS) !== undefined;
		if (free) return [slot];
		const modes = slot.modes.filter((m) => m !== "onsite");
		return modes.length === 0 ? [] : [{ ...slot, modes }];
	});
}
