import type { LogEvent } from "../http/context";

/** What happened. The set the team asked to be told about (and the visitor, where it concerns them). */
export const NOTIFY_EVENTS = [
	"request.created",
	"appointment.requested",
	"appointment.confirmed",
	"appointment.moved",
	"appointment.cancelled",
	"attendance.no_show",
	"payment.recorded",
	"leave.requested",
	"leave.decided",
	"package.low",
	"reminder.day_before",
	"reminder.two_hours",
	"reminder.failed",
	"feedback.requested",
	"feedback.negative",
	"account.invite",
	"account.invite_existing",
	"account.activated",
	"blacklist.attempt",
	"appointment.conflict",
	"digest.reception_daily",
	"digest.practitioner_evening",
	"digest.owner_daily",
	"digest.owner_weekly",
	"schedule.changed",
	"record.todo",
	"client.assigned",
	"delivery.failed",
	"security.action",
] as const;
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];

/**
 * Who is told. The service names a recipient by reference; the adapter (estate Novu through `@psi/notify`) resolves an
 * address at send time, so a payload never carries a phone number or an e-mail.
 */
export type Recipient =
	| { kind: "team"; permission: string }
	| { kind: "person"; subject: string }
	| { kind: "client"; clientId: string }
	| { kind: "request"; reference: string };

export interface Notification {
	app: string;
	event: NotifyEvent;
	/** Ids, counts and states only. Never a name, a contact or anything clinical. */
	payload: Readonly<Record<string, string | number | boolean>>;
	to: Recipient;
	/** The same action retried produces the same key: the notifier sends once. */
	idempotencyKey: string;
}

/** A member of the staff, as the notifier needs to reach them. Never a name or an address in a log. */
export interface StaffPerson {
	subject: string;
	name?: string | undefined;
	email?: string | undefined;
}

/** `notify` with the action's own idempotency key, and the directory the messages go through (subscribers). */
export interface NotifyPort {
	notify(notification: Notification): Promise<void>;
	/** Keeps the notifier's subscriber in step with the member (their name and address). */
	syncPerson(app: string, person: StaffPerson): Promise<void>;
}

export interface MemoryNotify extends NotifyPort {
	sent: Notification[];
	/** The directory calls, in order. */
	synced: { app: string; person: StaffPerson }[];
	/** Make the next sends fail, to prove a failed notification never fails the action. */
	failing: boolean;
}

export function createMemoryNotify(): MemoryNotify {
	const seen = new Set<string>();
	const self: MemoryNotify = {
		sent: [],
		synced: [],
		failing: false,
		syncPerson(app, person) {
			if (self.failing) return Promise.reject(new Error("notifier down"));
			self.synced.push({ app, person });
			return Promise.resolve();
		},
		notify(n) {
			if (self.failing) return Promise.reject(new Error("notifier down"));
			if (seen.has(n.idempotencyKey)) return Promise.resolve();
			seen.add(n.idempotencyKey);
			self.sent.push(n);
			return Promise.resolve();
		},
	};
	return self;
}

/** Without the notifier configured (development): the notification is logged by id and nothing is sent. */
export function createLoggingNotify(log: (e: LogEvent) => void): NotifyPort {
	return {
		syncPerson() {
			return Promise.resolve();
		},
		notify(n) {
			log({
				level: "warn",
				event: "notify_not_configured",
				requestId: n.idempotencyKey,
				notification: n.event,
				app: n.app,
			});
			return Promise.resolve();
		},
	};
}
