import { createHmac, timingSafeEqual } from "node:crypto";
import type {
	PushPayload,
	PushStore,
	PushTransport,
	PushKind as PwaKind,
	SubscriptionRecord,
	Topic,
} from "@psi/pwa";
import { Hono } from "hono";
import { z } from "zod";
import { type EventId, EventIdSchema } from "../apps";
import { AudienceSchema } from "../catalogue";

export const NOVU_SIGNATURE_HEADER = "x-novu-signature";

/** What a delivery of one event means on a device: the topic that allows it, the kind the worker words, where a tap leads. */
interface Route {
	topic: Topic;
	kind: PwaKind;
	tag: string;
	/** A path on the receiving site; never a reference, a time or a name. */
	url: (locale: "ro" | "en") => string;
	urgency: "high" | "normal";
}

const account = (locale: "ro" | "en"): string => (locale === "en" ? "/en/cont" : "/cont");

const STAFF = {
	request: {
		topic: "requests",
		kind: "clinic.request",
		tag: "clinic-request",
		url: () => "/requests",
		urgency: "high",
	},
	appointment: {
		topic: "appointments",
		kind: "clinic.appointment",
		tag: "clinic-appointment",
		url: () => "/calendar",
		urgency: "high",
	},
	reminder: {
		topic: "reminders",
		kind: "clinic.reminder",
		tag: "clinic-reminder",
		url: () => "/calendar",
		urgency: "normal",
	},
	leave: {
		topic: "requests",
		kind: "clinic.request",
		tag: "clinic-leave",
		url: () => "/roster/leave",
		urgency: "normal",
	},
} as const satisfies Record<string, Route>;

const CLIENT = (kind: PwaKind, urgency: Route["urgency"]): Route => ({
	topic: "booking",
	kind,
	tag: "booking",
	url: account,
	urgency,
});

/** The route of an event for an audience; undefined when the pair is never pushed. */
export function routeOf(
	event: EventId,
	audience: z.infer<typeof AudienceSchema>,
): Route | undefined {
	if (audience === "client") {
		switch (event) {
			case "appointment.confirmed":
				return CLIENT("booking.confirmed", "high");
			case "appointment.moved":
				return CLIENT("booking.moved", "high");
			case "appointment.cancelled":
				return CLIENT("booking.cancelled", "high");
			case "reminder.day_before":
				return CLIENT("booking.reminder", "normal");
			default:
				return undefined;
		}
	}
	switch (event) {
		case "request.new":
			return STAFF.request;
		case "leave.requested":
			return STAFF.leave;
		case "appointment.requested":
		case "appointment.confirmed":
		case "appointment.moved":
		case "appointment.cancelled":
			return audience === "practitioner" ? STAFF.appointment : undefined;
		case "reminder.confirmed":
		case "reminder.declined":
			return audience === "reception" ? STAFF.reminder : undefined;
		default:
			return undefined;
	}
}

/** The slice of what Novu's Push Webhook posts that is used: device tokens and which event this was. */
const Body = z
	.object({
		target: z.array(z.string().min(1).max(100)).max(50),
		payload: z
			.object({ meta: z.object({ event: EventIdSchema, audience: AudienceSchema }).passthrough() })
			.passthrough(),
	})
	.passthrough();

export interface PushHookOptions {
	/** The Push Webhook integration's "Secret HMAC Key" (`NOVU_PUSH_SECRET`). */
	secret: string;
	store: () => Promise<PushStore>;
	/** Null while push is off (no VAPID pair): the hook answers 503. */
	transport: () => PushTransport | null;
	/** The site this hook serves: only its own devices are pushed. */
	site: SubscriptionRecord["site"];
	now?: () => number;
}

function validSignature(raw: string, given: string | undefined, secret: string): boolean {
	if (given === undefined) return false;
	const expected = createHmac("sha256", secret).update(raw).digest();
	const hex = given.replace(/^sha256=/, "");
	if (!/^[0-9a-f]{64}$/i.test(hex)) return false;
	return timingSafeEqual(Buffer.from(hex, "hex"), expected);
}

/**
 * `POST /` — Novu's Push Webhook for Web Push (Novu 3.19 has no Web Push provider; the estate's
 * VAPID transport delivers, Novu decides who, when and through which channel). Mount it at
 * `/__pwa/novu`. The device tokens in `target` are subscription ids. The message sent to a device
 * is `@psi/pwa`'s own payload — kind, locale, a generic path, a tag: no name, time, reference or
 * reason ever leaves in a push, whatever the trigger carried.
 */
export function createPushHook(o: PushHookOptions): Hono {
	const app = new Hono();
	app.post("/", async (c) => {
		const raw = await c.req.text();
		if (!validSignature(raw, c.req.header(NOVU_SIGNATURE_HEADER), o.secret))
			return c.body(null, 401);
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			return c.body(null, 400);
		}
		const body = Body.safeParse(parsed);
		if (!body.success) return c.body(null, 400);
		const { event, audience } = body.data.payload.meta;
		const transport = o.transport();
		if (transport === null) return c.body(null, 503);
		const store = await o.store();
		const route = routeOf(event, audience);
		const result = { sent: 0, skipped: 0, removed: 0, failed: 0 };
		if (route === undefined) return c.json({ ...result, skipped: body.data.target.length }, 200);
		for (const token of new Set(body.data.target)) {
			const device = await store.byId(token);
			if (device === null || device.site !== o.site || !device.topics.includes(route.topic)) {
				result.skipped++;
				continue;
			}
			const payload: PushPayload = {
				v: 1,
				kind: route.kind,
				locale: device.locale,
				url: route.url(device.locale),
				tag: route.tag,
			};
			const sent = await transport.send(device, payload, {
				ttl: route.urgency === "high" ? 24 * 3600 : 12 * 3600,
				urgency: route.urgency,
			});
			if (sent.ok) {
				result.sent++;
				await store.delivered(device.endpoint, (o.now ?? Date.now)());
			} else if (sent.gone) {
				result.removed++;
				await store.removeEndpoint(device.endpoint);
			} else {
				result.failed++;
				await store.failed(device.endpoint, (o.now ?? Date.now)());
			}
		}
		// A transport failure answers 502 so Novu retries; the rest is final.
		return c.json(result, result.failed > 0 && result.sent === 0 ? 502 : 200);
	});
	return app;
}
