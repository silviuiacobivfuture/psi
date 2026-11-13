import type {
	LiveBooking,
	LiveClosure,
	LiveData,
	LiveDevice,
	LiveRoom,
	Viewer,
} from "./live-types";
import { MINUTE } from "./zone";

export type RoomState = "free" | "booked" | "closed" | "conflict";

/** A booking as the plan shows it: the client's initials are present only for a viewer who may see clients. */
export interface BookingView {
	id: string;
	start: number;
	until: number;
	monogram: string;
	practitioner: string;
	service: string;
	people: number;
	clientInitials?: ReadonlyArray<string>;
}

export interface RoomLive {
	roomId: string;
	state: RoomState;
	/** The bookings holding the room at the instant (empty unless booked or in conflict). */
	active: ReadonlyArray<BookingView>;
	closure?: { start: number; until: number; reason?: string };
	/** When the state next changes (the earliest end among what holds the room now), if it does. */
	changesAt?: number;
	/** For a free room: the next booking's start. */
	nextStart?: number;
}

export function isBlocking(b: LiveBooking, now: number): boolean {
	if (b.status === "requested" || b.status === "confirmed") return true;
	return b.status === "held" && b.holdExpiresAt !== undefined && b.holdExpiresAt > now;
}

/** Half-open: a booking holds its start instant and not its end instant. */
export function covers(span: { start: number; until: number }, t: number): boolean {
	return span.start <= t && t < span.until;
}

export function viewOf(b: LiveBooking, viewer: Viewer): BookingView {
	const base: BookingView = {
		id: b.id,
		start: b.start,
		until: b.until,
		monogram: b.practitioner.monogram,
		practitioner: b.practitioner.name,
		service: b.service,
		people: b.people,
	};
	return viewer.seeClients && b.clientInitials !== undefined
		? { ...base, clientInitials: b.clientInitials }
		: base;
}

function overbooked(active: ReadonlyArray<LiveBooking>, room: LiveRoom, closed: boolean): boolean {
	if (active.length === 0) return false;
	if (closed) return true;
	const people = active.reduce((n, b) => n + b.people, 0);
	if (room.capacity > 0 && people > room.capacity) return true;
	return active.length > 1 && active.some((b) => !b.shared);
}

/** One room's state at instant `t`; `now` decides whether a hold still blocks. */
export function roomLiveAt(
	room: LiveRoom,
	bookings: ReadonlyArray<LiveBooking>,
	t: number,
	now: number,
	viewer: Viewer,
): RoomLive {
	const mine = bookings.filter((b) => b.roomId === room.id && isBlocking(b, now));
	const active = mine.filter((b) => covers(b, t));
	const closure: LiveClosure | undefined = room.closures.find((c) => covers(c, t));
	const state: RoomState = overbooked(active, room, closure !== undefined)
		? "conflict"
		: closure !== undefined
			? "closed"
			: active.length > 0
				? "booked"
				: "free";
	const ends = [...active.map((b) => b.until), ...(closure ? [closure.until] : [])];
	const nextStart = mine
		.filter((b) => b.start > t)
		.reduce<number | undefined>(
			(m, b) => (m === undefined || b.start < m ? b.start : m),
			undefined,
		);
	const live: RoomLive = {
		roomId: room.id,
		state,
		active: active.map((b) => viewOf(b, viewer)),
	};
	if (closure) live.closure = closure;
	if (ends.length > 0) live.changesAt = Math.min(...ends);
	if (state === "free" && nextStart !== undefined) live.nextStart = nextStart;
	return live;
}

export type DeviceState = "in-use" | "free";

export function deviceStateAt(
	device: LiveDevice,
	bookings: ReadonlyArray<LiveBooking>,
	t: number,
	now: number,
): DeviceState {
	return bookings.some((b) => isBlocking(b, now) && covers(b, t) && b.deviceIds.includes(device.id))
		? "in-use"
		: "free";
}

export interface LiveSnapshot {
	at: number;
	rooms: ReadonlyMap<string, RoomLive>;
	devices: ReadonlyMap<string, DeviceState>;
}

export function snapshotAt(data: LiveData, t: number, now: number, viewer: Viewer): LiveSnapshot {
	return {
		at: t,
		rooms: new Map(data.rooms.map((r) => [r.id, roomLiveAt(r, data.bookings, t, now, viewer)])),
		devices: new Map(data.devices.map((d) => [d.id, deviceStateAt(d, data.bookings, t, now)])),
	};
}

/** The length of the union of the spans inside [from, to), in minutes: overlapping bookings count once. */
export function unionMinutes(
	spans: ReadonlyArray<{ start: number; until: number }>,
	from: number,
	to: number,
): number {
	const clipped = spans
		.map((s) => ({ start: Math.max(s.start, from), until: Math.min(s.until, to) }))
		.filter((s) => s.until > s.start)
		.sort((a, b) => a.start - b.start);
	let total = 0;
	let edge = from;
	for (const s of clipped) {
		const start = Math.max(s.start, edge);
		if (s.until > start) {
			total += s.until - start;
			edge = s.until;
		}
	}
	return Math.round(total / MINUTE);
}

export const HEAT_LEVELS = 5;

export interface HeatCell {
	roomId: string;
	minutes: number;
	/** 0 (nothing booked) to 4 (the busiest room of the week). */
	level: number;
}

/** Booked minutes per room over [from, to), levelled against the busiest room so the tint always uses its whole range. */
export function weekHeat(
	data: LiveData,
	from: number,
	to: number,
	now: number,
): ReadonlyArray<HeatCell> {
	const minutes = data.rooms.map((r) =>
		unionMinutes(
			data.bookings.filter((b) => b.roomId === r.id && isBlocking(b, now)),
			from,
			to,
		),
	);
	const max = Math.max(0, ...minutes);
	return data.rooms.map((r, i) => {
		const m = minutes[i] ?? 0;
		const level = m === 0 || max === 0 ? 0 : Math.max(1, Math.ceil((m / max) * (HEAT_LEVELS - 1)));
		return { roomId: r.id, minutes: m, level };
	});
}

export interface TimelineEntry {
	kind: "booking" | "closure";
	start: number;
	until: number;
	booking?: BookingView;
	reason?: string;
	conflict: boolean;
}

/** A room's day, in order: its bookings (redacted for the viewer) and its closures, each flagged when it clashes with another. */
export function roomDay(
	room: LiveRoom,
	bookings: ReadonlyArray<LiveBooking>,
	from: number,
	to: number,
	now: number,
	viewer: Viewer,
): ReadonlyArray<TimelineEntry> {
	const mine = bookings.filter(
		(b) => b.roomId === room.id && isBlocking(b, now) && b.start < to && b.until > from,
	);
	const entries: TimelineEntry[] = [
		...mine.map((b): TimelineEntry => {
			const others = mine.filter((o) => o !== b && o.start < b.until && b.start < o.until);
			const group = [b, ...others];
			const clash = others.length > 0 && overbooked(group, room, false);
			const closed = room.closures.some((c) => c.start < b.until && b.start < c.until);
			return {
				kind: "booking",
				start: b.start,
				until: b.until,
				booking: viewOf(b, viewer),
				conflict: clash || closed,
			};
		}),
		...room.closures
			.filter((c) => c.start < to && c.until > from)
			.map(
				(c): TimelineEntry => ({
					kind: "closure",
					start: c.start,
					until: c.until,
					...(c.reason ? { reason: c.reason } : {}),
					conflict: false,
				}),
			),
	];
	return entries.sort((a, b) => a.start - b.start || a.until - b.until);
}
