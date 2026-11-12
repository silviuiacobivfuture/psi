import type { Busy } from "./catalog";

/** Two half-open spans [start, until) share at least one instant. */
export function overlaps(a: Busy, b: Busy): boolean {
	return a.start < b.until && b.start < a.until;
}

/** What blocks a calendar: a live hold, a request awaiting the team, or a confirmed appointment. */
export interface Booked {
	status: AppointmentStatus;
	start: number;
	/** The end of the session plus its buffer. */
	blockedUntil: number;
	/** For a hold: when it lapses. */
	holdExpiresAt?: number;
}

/** Every state an appointment can be in (see `lifecycle.ts`). */
export type AppointmentStatus =
	| "held"
	| "requested"
	| "confirmed"
	| "cancelled"
	| "declined"
	| "expired";

export const APPOINTMENT_STATUSES: ReadonlyArray<AppointmentStatus> = [
	"held",
	"requested",
	"confirmed",
	"cancelled",
	"declined",
	"expired",
];

/**
 * True when the appointment still takes its time. A hold stops blocking the moment it lapses,
 * whether or not the sweep has marked it yet, so correctness never waits for a background job.
 */
export function isBlocking(booked: Booked, now: number): boolean {
	if (booked.status === "requested" || booked.status === "confirmed") return true;
	if (booked.status !== "held") return false;
	return booked.holdExpiresAt !== undefined && booked.holdExpiresAt > now;
}

/** The busy spans of the appointments that still block at `now`. */
export function busyFrom(booked: ReadonlyArray<Booked>, now: number): ReadonlyArray<Busy> {
	return booked
		.filter((b) => isBlocking(b, now))
		.map((b) => ({ start: b.start, until: b.blockedUntil }));
}

/** The first blocking appointment that overlaps `span`, if any. */
export function firstConflict<T extends Booked>(
	span: Busy,
	booked: ReadonlyArray<T>,
	now: number,
): T | undefined {
	return booked.find(
		(b) => isBlocking(b, now) && overlaps(span, { start: b.start, until: b.blockedUntil }),
	);
}
