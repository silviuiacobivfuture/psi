import type { Context } from "hono";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { type Identity, mountPushApi, PUSH_PATHS } from "./api";
import { createNotifier } from "./notifier";
import { signNotify } from "./signing";
import { memoryPushStore } from "./store";
import type { PushTransport } from "./transport";

const ORIGIN = "https://psizone.ro";
const NOW = Date.UTC(2026, 10, 12, 9, 0);
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/device-1";
const SECRET = "s".repeat(40);
const KEYS = { p256dh: `B${"p".repeat(86)}`, auth: "a".repeat(22) };

function setup(subject: string | null) {
	const store = memoryPushStore();
	const sends: string[] = [];
	const transport: PushTransport = {
		async send(to, payload) {
			sends.push(`${to.endpoint}:${payload.kind}`);
			return { ok: true, status: 201 };
		},
	};
	const notifier = createNotifier({ store, transport, now: () => NOW });
	const identity: Identity = {
		session: () => async (_c, next) => {
			await next();
		},
		current: (_c: Context) =>
			subject === null ? null : { subject, user: `user:${subject}`, email: null, name: null },
	};
	const app = new Hono();
	mountPushApi(app, {
		enabled: true,
		site: "psizone",
		origin: ORIGIN,
		topics: ["booking", "articles:psizone"],
		store: async () => store,
		notifier: async () => notifier,
		identity,
		notifySecret: SECRET,
		returnTo: (l) => (l === "en" ? "/en/cont/notificari" : "/cont/notificari"),
		now: () => NOW,
	});
	return { app, store, sends };
}

const post = (app: Hono, path: string, body: unknown, origin = ORIGIN) =>
	app.request(path, {
		method: "POST",
		headers: { "content-type": "application/json", origin },
		body: JSON.stringify(body),
	});

const subscribe = (topics: string[], endpoint = ENDPOINT) => ({
	subscription: { endpoint, expirationTime: null, keys: KEYS },
	topics,
	locale: "ro",
});

describe("subscribe", () => {
	it("keeps an anonymous visitor's article subscription, unlinked", async () => {
		const { app, store } = setup(null);
		const res = await post(app, PUSH_PATHS.subscribe, subscribe(["articles:psizone"]));
		expect(res.status).toBe(200);
		expect(res.headers.get("cache-control")).toBe("private, no-store");
		expect(await res.json()).toEqual({ topics: ["articles:psizone"], linked: false });
		expect((await store.byEndpoint(ENDPOINT))?.subject).toBeNull();
	});

	it("refuses booking updates to an anonymous visitor", async () => {
		const { app, store } = setup(null);
		const res = await post(app, PUSH_PATHS.subscribe, subscribe(["booking"]));
		expect(res.status).toBe(401);
		expect(await store.byEndpoint(ENDPOINT)).toBeNull();
	});

	it("links a signed-in person's subscription to the account", async () => {
		const { app, store } = setup("alice");
		const res = await post(app, PUSH_PATHS.subscribe, subscribe(["booking", "articles:psizone"]));
		expect(await res.json()).toEqual({ topics: ["booking", "articles:psizone"], linked: true });
		expect((await store.forTopic("booking", "alice")).map((s) => s.endpoint)).toEqual([ENDPOINT]);
	});

	it("refuses another origin, a non-push endpoint and a malformed body", async () => {
		const { app } = setup("alice");
		expect(
			(await post(app, PUSH_PATHS.subscribe, subscribe(["booking"]), "https://evil.test")).status,
		).toBe(403);
		expect(
			(await post(app, PUSH_PATHS.subscribe, subscribe(["booking"], "https://10.0.0.1/hook")))
				.status,
		).toBe(400);
		expect((await post(app, PUSH_PATHS.subscribe, { topics: "all" })).status).toBe(400);
	});

	it("ignores topics this site does not offer", async () => {
		const { app } = setup(null);
		const res = await post(
			app,
			PUSH_PATHS.subscribe,
			subscribe(["articles:eqsync", "articles:psizone"]),
		);
		expect(await res.json()).toEqual({ topics: ["articles:psizone"], linked: false });
	});
});

describe("status, unsubscribe and test need the subscription's own secret", () => {
	it("tells topics only to the browser holding the auth secret, and forgets on unsubscribe", async () => {
		const { app, store } = setup(null);
		await post(app, PUSH_PATHS.subscribe, subscribe(["articles:psizone"]));
		const wrong = await post(app, PUSH_PATHS.status, { endpoint: ENDPOINT, auth: "b".repeat(22) });
		expect(await wrong.json()).toEqual({ topics: [], linked: false });
		const right = await post(app, PUSH_PATHS.status, { endpoint: ENDPOINT, auth: KEYS.auth });
		expect(await right.json()).toEqual({ topics: ["articles:psizone"], linked: false });
		await post(app, PUSH_PATHS.unsubscribe, { endpoint: ENDPOINT, auth: "b".repeat(22) });
		expect(await store.byEndpoint(ENDPOINT)).not.toBeNull();
		await post(app, PUSH_PATHS.unsubscribe, { endpoint: ENDPOINT, auth: KEYS.auth });
		expect(await store.byEndpoint(ENDPOINT)).toBeNull();
	});

	it("sends a test push to the requesting browser only, at most every 30 s", async () => {
		const { app, sends } = setup(null);
		await post(app, PUSH_PATHS.subscribe, subscribe(["articles:psizone"]));
		expect((await post(app, PUSH_PATHS.test, { endpoint: ENDPOINT, auth: KEYS.auth })).status).toBe(
			200,
		);
		expect((await post(app, PUSH_PATHS.test, { endpoint: ENDPOINT, auth: KEYS.auth })).status).toBe(
			429,
		);
		expect(sends).toEqual([`${ENDPOINT}:test`]);
	});
});

describe("the signed hook", () => {
	const hook = (app: Hono, body: unknown, signature?: string) => {
		const raw = JSON.stringify(body);
		return app.request(PUSH_PATHS.hook, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-psi-signature": signature ?? signNotify(raw, SECRET),
			},
			body: raw,
		});
	};

	it("delivers a correctly signed, fresh event", async () => {
		const { app, store, sends } = setup("alice");
		await post(app, PUSH_PATHS.subscribe, subscribe(["booking"]));
		await store.linkBooking("PZ-1", "alice", NOW);
		const res = await hook(app, {
			event: { kind: "booking.confirmed", reference: "PZ-1" },
			sentAt: new Date(NOW).toISOString(),
		});
		expect(res.status).toBe(200);
		expect(sends).toEqual([`${ENDPOINT}:booking.confirmed`]);
	});

	it("refuses a bad signature, a stale event and an unknown kind", async () => {
		const { app } = setup(null);
		const event = { kind: "booking.cancelled", reference: "PZ-1" };
		expect(
			(await hook(app, { event, sentAt: new Date(NOW).toISOString() }, "sha256=00")).status,
		).toBe(401);
		expect((await hook(app, { event, sentAt: new Date(NOW - 600_000).toISOString() })).status).toBe(
			400,
		);
		expect(
			(
				await hook(app, {
					event: { kind: "booking.diagnosis" },
					sentAt: new Date(NOW).toISOString(),
				})
			).status,
		).toBe(400);
	});
});
