import { sendNotification, WebPushError } from "web-push";
import type { Vapid } from "./local-vapid";
import type { PushPayload, SubscriptionRecord } from "./types";

export interface SendOptions {
	/** Seconds the push service keeps the message for an offline device. */
	ttl: number;
	urgency: "very-low" | "low" | "normal" | "high";
	/** Replaces an undelivered message with the same topic (≤ 32 URL-safe characters). */
	topic?: string;
}

/** `gone`: the browser dropped the subscription (404/410) — delete it. `failed`: try again later. */
export type SendResult =
	| { ok: true; status: number }
	| { ok: false; gone: boolean; status: number };

/**
 * How one encrypted message reaches one browser. The default sends it straight to the browser's
 * push service, signed with the estate's VAPID key (RFC 8292) and encrypted for the subscription
 * (RFC 8291, aes128gcm). A Novu-backed transport can take its place (docs/plans/pwa.md §Novu).
 */
export interface PushTransport {
	send(to: SubscriptionRecord, payload: PushPayload, options: SendOptions): Promise<SendResult>;
}

export function webPushTransport(vapid: Vapid, timeoutMs = 10_000): PushTransport {
	return {
		async send(to, payload, options) {
			try {
				const res = await sendNotification(
					{ endpoint: to.endpoint, keys: { p256dh: to.p256dh, auth: to.auth } },
					JSON.stringify(payload),
					{
						vapidDetails: vapid,
						TTL: options.ttl,
						urgency: options.urgency,
						...(options.topic !== undefined ? { topic: options.topic } : {}),
						timeout: timeoutMs,
						contentEncoding: "aes128gcm",
					},
				);
				return { ok: true, status: res.statusCode };
			} catch (err) {
				if (err instanceof WebPushError) {
					return {
						ok: false,
						gone: err.statusCode === 404 || err.statusCode === 410,
						status: err.statusCode,
					};
				}
				return { ok: false, gone: false, status: 0 };
			}
		},
	};
}
