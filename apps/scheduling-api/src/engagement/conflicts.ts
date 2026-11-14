import type { AppointmentRow, RosterRow } from "../store/types";
import { localClock } from "./digest-data";

export type ConflictKind = "practitioner" | "room" | "device" | "roster";

export interface Conflict {
	/** The earlier of the two sessions (or the only one, for a day the therapist does not work). */
	appointmentId: string;
	/** The other session; absent for `roster`. */
	otherAppointmentId?: string;
	what: ConflictKind;
	/** Where the conflict starts: its identity together with the ids, so a session moved to another time is a new conflict. */
	at: number;
}

const live = (a: AppointmentRow): boolean =>
	a.deletedAt === undefined && a.kind === "session" && a.status === "scheduled";

const minutesOf = (clock: string): number => {
	const [h, m] = clock.split(":");
	return Number(h) * 60 + Number(m);
};

/**
 * Two live sessions that overlap on one therapist, one room or one device. The booking refuses these, so what this finds
 * got in some other way (an import, an old edit, a change of room after the fact): it is the second line, not the first.
 */
export function overlaps(rows: readonly AppointmentRow[]): Conflict[] {
	const sessions = rows.filter(live).sort((a, b) => a.start - b.start);
	const by: ReadonlyArray<[ConflictKind, (a: AppointmentRow) => string | undefined]> = [
		["practitioner", (a) => a.practitionerId],
		["room", (a) => a.roomId],
		["device", (a) => a.deviceId],
	];
	const found: Conflict[] = [];
	for (const [what, resource] of by) {
		const groups = new Map<string, AppointmentRow[]>();
		for (const a of sessions) {
			const id = resource(a);
			if (id !== undefined) groups.set(id, [...(groups.get(id) ?? []), a]);
		}
		for (const list of groups.values())
			for (let i = 0; i < list.length; i++)
				for (let j = i + 1; j < list.length; j++) {
					const [a, b] = [list[i], list[j]];
					if (a === undefined || b === undefined || b.start >= a.end) continue;
					found.push({ appointmentId: a.id, otherAppointmentId: b.id, what, at: a.start });
				}
	}
	return found;
}

/**
 * A live session on a day the therapist does not work (a day off, leave) or outside the hours they do, as the roster says.
 * A day with no roster row is not a conflict: nobody said they are away.
 */
export function offDuty(
	rows: readonly AppointmentRow[],
	rosterOf: (personId: string, date: string) => RosterRow | undefined,
	dateOf: (instant: number) => string,
	timeZone: string,
): Conflict[] {
	const found: Conflict[] = [];
	for (const a of rows.filter(live)) {
		const day = rosterOf(a.practitionerId, dateOf(a.start));
		if (day === undefined) continue;
		const outside =
			day.kind !== "work" ||
			(day.start !== undefined &&
				day.end !== undefined &&
				(minutesOf(localClock(a.start, timeZone)) < day.start ||
					minutesOf(localClock(a.end, timeZone)) > day.end));
		if (outside) found.push({ appointmentId: a.id, what: "roster", at: a.start });
	}
	return found;
}
