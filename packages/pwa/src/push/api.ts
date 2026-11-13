import { type Guard, sameOrigin } from "@psi/account";
import type { Context, Hono } from "hono";
import { z } from "zod";
import { allowedPushEndpoint } from "./endpoints";
import type { Notifier } from "./notifier";
import { NOTIFY_SIGNATURE_HEADER, verifyNotify } from "./signing";
import type { PushStore } from "./store";
import {
	ACCOUNT_TOPICS,
	BrowserSubscriptionSchema,
	LocaleSchema,
	NotifyEventSchema,
	type SiteSchema,
	type Topic,
	TopicSchema,
} from "./types";

/** The push API's paths (all POST; the service worker never caches `/pwa` or `/__pwa`). */
export const PUSH_PATHS = {
	subscribe: "/pwa/push/subscribe",
	status: "/pwa/push/status",
	unsubscribe: "/pwa/push/unsubscribe",
	test: "/pwa/push/test",
	removeDevice: "/pwa/push/devices/remove",
	hook: "/__pwa/notify",
} as const;

/** What the API needs from @psi/account: the session, and who it is. */
export type Identity = Pick<Guard, "session" | "current">;

export interface PushApiOptions {
	/** False while push is off: subscribing, status and tests answer 503 and nothing is stored. */
	enabled: boolean;
	site: z.infer<typeof SiteSchema>;
	/** This site's canonical origin: writes are accepted only from it. */
	origin: string;
	/** The topics this site offers; anything else is refused. */
	topics: ReadonlyArray<Topic>;
	store: () => Promise<PushStore>;
	notifier: () => Promise<Notifier | null>;
	identity: Identity;
	/** The HMAC key of the signed hook; null turns the hook off (503). */
	notifySecret: string | null;
	/** Where the device list's remove form returns to. */
	returnTo: (locale: "ro" | "en") => string;
	/**
	 * Called, best effort, after a signed-in person's devices changed (subscribed, unsubscribed,
	 * removed): where `@psi/notify` keeps Novu's push device tokens for that person in step.
	 */
	onDevicesChanged?: (subject: string) => Promise<void>;
	now?: () => number;
}

const SubscribeBody = z.object({
	subscription: BrowserSubscriptionSchema,
	topics: z.array(TopicSchema).max(8),
	locale: LocaleSchema,
});
/** The endpoint and its auth secret: only the browser holding the subscription knows both. */
const OwnBody = z.object({
	endpoint: z.string().url().max(2048),
	auth: z.string().min(16).max(64),
});
const HookBody = z.object({ event: NotifyEventSchema, sentAt: z.string().datetime() });
const RemoveForm = z.object({ id: z.string().uuid(), locale: LocaleSchema });

const NO_STORE = { "cache-control": "private, no-store" } as const;
const HOOK_MAX_AGE_MS = 5 * 60_000;
const TEST_EVERY_MS = 30_000;

async function subjectOf(c: Context, identity: Identity): Promise<string | null> {
	await identity.session()(c, async () => {});
	return identity.current(c)?.subject ?? null;
}

async function json(c: Context): Promise<unknown> {
	return c.req.json().catch(() => null);
}

/**
 * The push API. Subscribing is a same-origin JSON POST made right after the person pressed
 * "Notify me" and the browser granted permission; the server keeps the endpoint, the two keys,
 * the topics, the locale and — when signed in — the account. `booking` needs an account.
 */
export function mountPushApi(app: Hono, o: PushApiOptions): void {
	const now = o.now ?? Date.now;
	const offered = new Set<Topic>(o.topics);
	const lastTest = new Map<string, number>();
	const foreign = (c: Context): boolean => !sameOrigin(c.req.raw.headers, c.req.method, o.origin);

	/** The subscription a browser proves it holds, or null. */
	async function owned(c: Context) {
		const body = OwnBody.safeParse(await json(c));
		if (!body.success) return null;
		const found = await (await o.store()).byEndpoint(body.data.endpoint);
		return found !== null && found.auth === body.data.auth ? found : null;
	}

	async function changed(subject: string | null): Promise<void> {
		if (subject === null || o.onDevicesChanged === undefined) return;
		try {
			await o.onDevicesChanged(subject);
		} catch {
			// Novu's push tokens catch up on the next change; the person's action is never blocked.
		}
	}

	const off = (c: Context) => c.json({ error: "off" }, 503, NO_STORE);

	app.post(PUSH_PATHS.subscribe, async (c) => {
		if (foreign(c)) return c.json({ error: "origin" }, 403, NO_STORE);
		if (!o.enabled) return off(c);
		const body = SubscribeBody.safeParse(await json(c));
		if (!body.success) return c.json({ error: "invalid" }, 400, NO_STORE);
		const { subscription, locale } = body.data;
		if (!allowedPushEndpoint(subscription.endpoint)) {
			return c.json({ error: "endpoint" }, 400, NO_STORE);
		}
		const topics = body.data.topics.filter((t) => offered.has(t));
		const store = await o.store();
		// Signed in: linked to the account. Signed out: a browser that proves it already holds this
		// subscription (same auth secret) keeps the link it was given while signed in.
		const before = await store.byEndpoint(subscription.endpoint);
		const subject =
			(await subjectOf(c, o.identity)) ??
			(before !== null && before.auth === subscription.keys.auth ? before.subject : null);
		if (subject === null && topics.some((t) => ACCOUNT_TOPICS.includes(t))) {
			return c.json({ error: "sign-in" }, 401, NO_STORE);
		}
		if (topics.length === 0) {
			await store.removeEndpoint(subscription.endpoint);
			await changed(subject);
			return c.json({ topics: [], linked: false }, 200, NO_STORE);
		}
		const saved = await store.upsert(
			{
				endpoint: subscription.endpoint,
				p256dh: subscription.keys.p256dh,
				auth: subscription.keys.auth,
				site: o.site,
				locale,
				topics,
				subject,
			},
			now(),
		);
		await changed(subject);
		return c.json({ topics: saved.topics, linked: saved.subject !== null }, 200, NO_STORE);
	});

	app.post(PUSH_PATHS.status, async (c) => {
		if (foreign(c)) return c.json({ error: "origin" }, 403, NO_STORE);
		if (!o.enabled) return off(c);
		const found = await owned(c);
		return c.json(
			{ topics: found?.topics ?? [], linked: found !== null && found.subject !== null },
			200,
			NO_STORE,
		);
	});

	app.post(PUSH_PATHS.unsubscribe, async (c) => {
		if (foreign(c)) return c.json({ error: "origin" }, 403, NO_STORE);
		if (!o.enabled) return off(c);
		const found = await owned(c);
		if (found !== null) {
			await (await o.store()).removeEndpoint(found.endpoint);
			await changed(found.subject);
		}
		return c.json({ topics: [] }, 200, NO_STORE);
	});

	app.post(PUSH_PATHS.test, async (c) => {
		if (foreign(c)) return c.json({ error: "origin" }, 403, NO_STORE);
		if (!o.enabled) return off(c);
		const found = await owned(c);
		if (found === null) return c.json({ error: "unknown" }, 404, NO_STORE);
		const at = now();
		if (at - (lastTest.get(found.endpoint) ?? 0) < TEST_EVERY_MS) {
			return c.json({ error: "too-soon" }, 429, NO_STORE);
		}
		lastTest.set(found.endpoint, at);
		const notifier = await o.notifier();
		if (notifier === null) return c.json({ error: "off" }, 503, NO_STORE);
		const report = await notifier.notify({ kind: "test", endpoint: found.endpoint });
		return c.json({ sent: report.sent }, 200, NO_STORE);
	});

	// The signed-in device list's remove button (a plain form: works without JavaScript).
	app.post(PUSH_PATHS.removeDevice, async (c) => {
		if (foreign(c)) return c.body(null, 403);
		const form = RemoveForm.safeParse(await c.req.parseBody().catch(() => ({})));
		if (!form.success) return c.body(null, 400);
		if (!o.enabled) return c.body(null, 503);
		const subject = await subjectOf(c, o.identity);
		if (subject === null) return c.body(null, 401);
		await (await o.store()).removeOwned(form.data.id, subject);
		await changed(subject);
		return c.redirect(o.returnTo(form.data.locale), 303);
	});

	// The hook scheduling and the ops smoke call: an HMAC-signed event, at most five minutes old.
	app.post(PUSH_PATHS.hook, async (c) => {
		if (o.notifySecret === null) return c.body(null, 503);
		const raw = await c.req.text();
		if (!verifyNotify(raw, c.req.header(NOTIFY_SIGNATURE_HEADER) ?? null, o.notifySecret)) {
			return c.body(null, 401);
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			return c.body(null, 400);
		}
		const body = HookBody.safeParse(parsed);
		if (!body.success || Math.abs(now() - Date.parse(body.data.sentAt)) > HOOK_MAX_AGE_MS) {
			return c.body(null, 400);
		}
		const notifier = await o.notifier();
		if (notifier === null) return c.body(null, 503);
		return c.json(await notifier.notify(body.data.event), 200, NO_STORE);
	});
}
