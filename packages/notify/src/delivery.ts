import type { AppKey, EventId } from "./apps";
import type { Audience, Channel } from "./catalogue";
import type { SuppressReason } from "./prefs";

/**
 * How far a notification got. Novu's open-source server reports no delivery webhooks, so the honest ladder ends where this
 * service can see: `queued` (in the outbox), `retrying` (Novu refused or was away), `sent` (Novu accepted and queued it for
 * its channels), `given_up` (retries exhausted or Novu refused for good), `suppressed` (nothing to send: switched off,
 * quiet hours, no address, no one to tell).
 */
export type DeliveryStatus = "queued" | "retrying" | "sent" | "given_up" | "suppressed";

export type SuppressedWhy =
	| SuppressReason
	| "event-off"
	| "receipts-off"
	| "no-channel"
	| "no-recipient";

/** One step in a delivery's life. Never an address, a name or a payload: a short hash of the recipient and the key. */
export interface DeliveryEvent {
	readonly app: AppKey;
	readonly event: EventId;
	readonly audience: Audience;
	/** The delivery's idempotency key: every step of one delivery shares it. */
	readonly key: string;
	/** A short hash of who it was for. */
	readonly to: string;
	/** The id of the object it was about (an appointment, a request): ids only, so a failure can be followed up. */
	readonly ref?: string;
	readonly status: DeliveryStatus;
	/** The channels the delivery may use (after preferences, quiet hours and addresses). */
	readonly channels: Readonly<Record<Channel, boolean>>;
	readonly suppressed: Readonly<Partial<Record<Channel, SuppressReason>>>;
	readonly why?: SuppressedWhy;
	readonly attempts: number;
	/** Novu's HTTP status for a failed attempt, 0 when unreachable. */
	readonly httpStatus?: number;
	readonly at: number;
}

/** Where steps are recorded. A failure to record is swallowed: it never blocks, retries or duplicates a notification. */
export interface DeliverySink {
	record(event: DeliveryEvent): Promise<void>;
}
