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

/** `notify(app, event, payload, to)` with an idempotency key, as `@psi/notify` will export it. */
export interface NotifyPort {
	notify(notification: Notification): Promise<void>;
}

export interface MemoryNotify extends NotifyPort {
	sent: Notification[];
	/** Make the next sends fail, to prove a failed notification never fails the action. */
	failing: boolean;
}

export function createMemoryNotify(): MemoryNotify {
	const seen = new Set<string>();
	const self: MemoryNotify = {
		sent: [],
		failing: false,
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

/** Until `@psi/notify` (branch clinic/notify) is wired: the notification is logged by id and nothing is sent. */
export function createLoggingNotify(log: (e: LogEvent) => void): NotifyPort {
	return {
		notify(n) {
			log({
				level: "warn",
				event: "notify_not_wired",
				requestId: n.idempotencyKey,
				notification: n.event,
				app: n.app,
			});
			return Promise.resolve();
		},
	};
}
