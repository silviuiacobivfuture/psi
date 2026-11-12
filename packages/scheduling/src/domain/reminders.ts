import type { AppointmentStatus } from "./conflicts";
import { MINUTE_MS } from "./time";

/**
 * A reminder the scheduling engine wants sent. It carries the appointment's reference and time
 * only: the sender looks the contact up at send time, so a cancelled or erased appointment is
 * never reminded. Nothing sends reminders yet; this is the seam a sender (Plunk, n8n) plugs into.
 */
export interface Reminder {
	reference: string;
	/** When to send, UTC ms. */
	at: number;
	/** The appointment's start, UTC ms. */
	start: number;
	/** How far ahead of the start, in minutes. */
	leadMinutes: number;
}

/** Where reminders go. Implementations must be idempotent per (reference, leadMinutes). */
export interface ReminderPort {
	schedule(reminders: ReadonlyArray<Reminder>): Promise<void>;
	cancel(reference: string): Promise<void>;
}

/** The default leads: a day before and two hours before. */
export const DEFAULT_REMINDER_LEADS: ReadonlyArray<number> = [24 * 60, 2 * 60];

/** The reminders a confirmed appointment gets: one per lead, none in the past, none otherwise. */
export function remindersFor(
	appointment: { reference: string; start: number; status: AppointmentStatus },
	now: number,
	leads: ReadonlyArray<number> = DEFAULT_REMINDER_LEADS,
): ReadonlyArray<Reminder> {
	if (appointment.status !== "confirmed") return [];
	return leads
		.map((leadMinutes) => ({
			reference: appointment.reference,
			at: appointment.start - leadMinutes * MINUTE_MS,
			start: appointment.start,
			leadMinutes,
		}))
		.filter((reminder) => reminder.at > now);
}
