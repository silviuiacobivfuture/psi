import type { Audience, Busy, RoomNeed } from "./catalog";
import { overlaps } from "./conflicts";
import { addDays, DAY_MINUTES, type LocalDate, resolveLocal } from "./time";

/** A room as the slot logic sees it: what it is, what it holds, who it suits. */
export interface RoomSpec {
	id: string;
	kind: string;
	capacity: number;
	suits: ReadonlyArray<Audience>;
	equipment: ReadonlyArray<string>;
}

/** The kinds of room a clinic like this has; the store keeps the word, the page translates it. */
export const ROOM_KINDS = [
	"therapy",
	"multisensory",
	"neurofeedback",
	"qeeg",
	"group",
	"movement",
	"other",
] as const;
export type RoomKind = (typeof ROOM_KINDS)[number];

/** True when the room is of the kind needed, has all the equipment, and suits every audience asked. */
export function roomSuits(room: RoomSpec, need: RoomNeed): boolean {
	return (
		room.kind === need.kind &&
		need.equipment.every((tag) => room.equipment.includes(tag)) &&
		need.audiences.every((a) => room.suits.includes(a))
	);
}

/** A closure of a room (maintenance, a private event): a whole date, or part of it, in wall time. */
export interface RoomClosure {
	date: LocalDate;
	start?: number;
	end?: number;
}

/** The instant a wall time names; a time in a daylight-saving gap moves to the first minute after it. */
function instantAt(date: LocalDate, minutes: number, timeZone: string): number {
	const day = minutes >= DAY_MINUTES ? addDays(date, 1) : date;
	for (
		let at = minutes >= DAY_MINUTES ? minutes - DAY_MINUTES : minutes;
		at < DAY_MINUTES;
		at += 1
	) {
		const r = resolveLocal(day, at, timeZone);
		if (r.kind === "exact") return r.instant;
		if (r.kind === "ambiguous") return r.earlier;
	}
	throw new RangeError(`no instant on ${day}`);
}

/** The spans of real time a room's closures take out: a whole-date closure is midnight to midnight. */
export function closureSpans(
	closures: ReadonlyArray<RoomClosure>,
	timeZone: string,
): ReadonlyArray<Busy> {
	return closures.map((c) => ({
		start: instantAt(c.date, c.start ?? 0, timeZone),
		until: instantAt(c.date, c.end ?? DAY_MINUTES, timeZone),
	}));
}

/** What a room has on its calendar: appointments' blocks and closures, as spans. */
export interface RoomCalendar {
	room: RoomSpec;
	busy: ReadonlyArray<Busy>;
}

/**
 * The first suitable room (in the order given, so the choice is the same every time) that is
 * free for `span`, and only from `allowed` when the practitioner may use some rooms only.
 * Undefined when none is: the slot is not offered for an onsite session.
 */
export function pickRoom(
	rooms: ReadonlyArray<RoomCalendar>,
	need: RoomNeed,
	span: Busy,
	allowed?: ReadonlyArray<string>,
): RoomSpec | undefined {
	return rooms.find(
		({ room, busy }) =>
			roomSuits(room, need) &&
			(allowed === undefined || allowed.length === 0 || allowed.includes(room.id)) &&
			!busy.some((b) => overlaps(span, b)),
	)?.room;
}
