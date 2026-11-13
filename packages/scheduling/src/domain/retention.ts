import type { AppointmentStatus } from "./conflicts";
import { DAY_MINUTES, MINUTE_MS } from "./time";

const DAY_MS = DAY_MINUTES * MINUTE_MS;

/**
 * How long the scheduling store keeps what. It is a calendar, not a clinical record: the contact
 * details serve one appointment and go soon after it; the bare slot (no person in it) stays a year
 * for capacity statistics; a lapsed hold, which never held a person, goes the next day.
 */
export interface RetentionPolicy {
	/** Days after the appointment ends (or is closed, if later) that the contact is erased. */
	contactDays: number;
	/** Days after the appointment ends that the whole record is deleted. */
	recordDays: number;
	/** Days after a hold lapses or is released that it is deleted. */
	holdDays: number;
}

export const DEFAULT_RETENTION: RetentionPolicy = { contactDays: 30, recordDays: 365, holdDays: 1 };

export type RetentionAction = "keep" | "erase_contact" | "delete";

/** What retention does to one appointment at `now`. */
export function retentionAction(
	appointment: {
		status: AppointmentStatus;
		end: number;
		updatedAt: number;
		hasContact: boolean;
		submitted: boolean;
	},
	now: number,
	policy: RetentionPolicy = DEFAULT_RETENTION,
): RetentionAction {
	const { status, end, updatedAt } = appointment;
	if (!appointment.submitted) {
		if (status === "held") return "keep";
		return now >= updatedAt + policy.holdDays * DAY_MS ? "delete" : "keep";
	}
	if (now >= end + policy.recordDays * DAY_MS) return "delete";
	const closedAt = Math.max(end, updatedAt);
	const settled = status !== "requested" || now >= end;
	if (appointment.hasContact && settled && now >= closedAt + policy.contactDays * DAY_MS) {
		return "erase_contact";
	}
	return "keep";
}

export type CallbackStatus = "new" | "handled";

/**
 * What retention does to one callback request at `now`. A callback is a web request like any other
 * (same `contactDays` and `recordDays`), with one difference: it has no appointment to end, so the
 * clock starts when the team handled it. An unhandled request keeps its contact: erasing it would
 * lose the very person the team has not yet called, and the team is told about it until it is.
 */
export function callbackRetentionAction(
	callback: {
		status: CallbackStatus;
		createdAt: number;
		handledAt: number | undefined;
		hasContact: boolean;
	},
	now: number,
	policy: RetentionPolicy = DEFAULT_RETENTION,
): RetentionAction {
	if (now >= callback.createdAt + policy.recordDays * DAY_MS) return "delete";
	if (callback.status !== "handled" || !callback.hasContact) return "keep";
	const handledAt = callback.handledAt ?? callback.createdAt;
	return now >= handledAt + policy.contactDays * DAY_MS ? "erase_contact" : "keep";
}
