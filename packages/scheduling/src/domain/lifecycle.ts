import type { AppointmentStatus } from "./conflicts";

/**
 * What can happen to an appointment. A visitor holds a slot and then submits it (a request); the
 * team confirms or declines a request; either side cancels; a hold lapses. Rescheduling cancels
 * the old appointment and creates a new one, in one transaction (see `convex/staff.ts`).
 */
export type AppointmentEvent =
	| { type: "submit" }
	| { type: "release" }
	| { type: "confirm" }
	| { type: "decline" }
	| { type: "cancel" }
	| { type: "expire" }
	| { type: "reschedule" };

/**
 * Why the team declined or cancelled, as a closed list the staff console offers: administrative,
 * never clinical, never free text (the store holds no reason for a visit, schema header).
 */
export const DECISION_REASONS = [
	"practitioner_unavailable",
	"schedule_conflict",
	"client_request",
	"duplicate",
	"no_response",
	"administrative",
] as const;

export type DecisionReason = (typeof DECISION_REASONS)[number];

/** A reason is kept only for what ends a request or appointment: a decline or a cancel. */
export function keepsReason(
	decision: "confirm" | "decline" | "cancel",
): boolean {
	return decision !== "confirm";
}

export type TransitionRefusal = "hold_expired" | "not_allowed";

export type Transition =
	| { ok: true; next: AppointmentStatus }
	| { ok: false; reason: TransitionRefusal };

/** The state an appointment is in, as the lifecycle reads it. */
export interface LifecycleState {
	status: AppointmentStatus;
	holdExpiresAt?: number;
}

const TABLE: Readonly<
	Record<
		AppointmentStatus,
		Partial<Record<AppointmentEvent["type"], AppointmentStatus>>
	>
> = {
	held: {
		submit: "requested",
		release: "cancelled",
		cancel: "cancelled",
		expire: "expired",
	},
	requested: {
		confirm: "confirmed",
		decline: "declined",
		cancel: "cancelled",
		reschedule: "cancelled",
	},
	confirmed: { cancel: "cancelled", reschedule: "cancelled" },
	cancelled: {},
	declined: {},
	expired: {},
};

function lapsed(state: LifecycleState, now: number): boolean {
	return state.holdExpiresAt === undefined || state.holdExpiresAt <= now;
}

/**
 * The next state, or why the event is refused. A lapsed hold can only expire (or be released):
 * submitting it is `hold_expired`, even before the sweep has marked it.
 */
export function transition(
	state: LifecycleState,
	event: AppointmentEvent,
	now: number,
): Transition {
	if (state.status === "held") {
		if (event.type === "expire") {
			return lapsed(state, now)
				? { ok: true, next: "expired" }
				: { ok: false, reason: "not_allowed" };
		}
		if (event.type === "submit" && lapsed(state, now))
			return { ok: false, reason: "hold_expired" };
	}
	const next = TABLE[state.status][event.type];
	return next === undefined
		? { ok: false, reason: "not_allowed" }
		: { ok: true, next };
}

/** True for the states nothing can leave. */
export function isFinal(status: AppointmentStatus): boolean {
	return Object.keys(TABLE[status]).length === 0;
}
