import type { Context } from "hono";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { type Identity, mountPushApi, PUSH_PATHS } from "./api";
import { createNotifier } from "./notifier";
import { memoryPushStore } from "./store";
import { ACCOUNT_TOPICS, TopicSchema } from "./types";

const ORIGIN = "https://clinic.psizone.ro";
const NOW = Date.UTC(2026, 10, 13, 9, 0);
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/device-9";
const KEYS = { p256dh: `B${"p".repeat(86)}`, auth: "a".repeat(22) };

function setup(subject: string | null, onDevicesChanged?: (subject: string) => Promise<void>) {
	const store = memoryPushStore();
	const notifier = createNotifier({
		store,
		transport: { send: async () => ({ ok: true, status: 201 }) },
		now: () => NOW,
	});
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
		topics: ["booking", "requests", "appointments", "reminders"],
		store: async () => store,
		notifier: async () => notifier,
		identity,
		notifySecret: null,
		returnTo: () => "/settings/notifications",
		...(onDevicesChanged ? { onDevicesChanged } : {}),
		now: () => NOW,
	});
	return { app, store };
}

const post = (app: Hono, path: string, body: unknown) =>
	app.request(path, {
		method: "POST",
		headers: { "content-type": "application/json", origin: ORIGIN },
		body: JSON.stringify(body),
	});
const subscribe = (topics: string[]) => ({
	subscription: { endpoint: ENDPOINT, expirationTime: null, keys: KEYS },
	topics,
	locale: "ro",
});

describe("staff push topics", () => {
	it("the three purposes exist and are account topics", () => {
		for (const t of ["requests", "appointments", "reminders"]) {
			expect(TopicSchema.safeParse(t).success).toBe(true);
			expect(ACCOUNT_TOPICS).toContain(t);
		}
		expect(ACCOUNT_TOPICS).not.toContain("articles:psizone");
	});

	for (const topic of ["requests", "appointments", "reminders"]) {
		it(`${topic} is refused to an anonymous visitor and stores nothing`, async () => {
			const { app, store } = setup(null);
			const res = await post(app, PUSH_PATHS.subscribe, subscribe([topic]));
			expect(res.status).toBe(401);
			expect(await store.byEndpoint(ENDPOINT)).toBeNull();
		});
	}

	it("a signed-in person holds any mix, and only their own subscriptions answer for a topic", async () => {
		const { app, store } = setup("alice");
		const res = await post(app, PUSH_PATHS.subscribe, subscribe(["requests", "reminders"]));
		expect(await res.json()).toEqual({ topics: ["requests", "reminders"], linked: true });
		expect((await store.forTopic("requests", "alice")).length).toBe(1);
		expect(await store.forTopic("requests", "bob")).toEqual([]);
		expect(await store.forTopic("requests")).toEqual([]);
		expect(await store.forTopic("appointments", "alice")).toEqual([]);
	});

	it("a topic the site does not offer is dropped", async () => {
		const { app } = setup("alice");
		const res = await post(app, PUSH_PATHS.subscribe, subscribe(["requests", "articles:blog"]));
		expect(res.status).toBe(400);
	});

	it("looks a subscription up by its id, which is the Novu device token", async () => {
		const { app, store } = setup("alice");
		await post(app, PUSH_PATHS.subscribe, subscribe(["requests"]));
		const saved = await store.byEndpoint(ENDPOINT);
		expect((await store.byId(saved?.id ?? ""))?.endpoint).toBe(ENDPOINT);
		expect(await store.byId("nope")).toBeNull();
	});
});

describe("device changes reach Novu's tokens", () => {
	it("subscribe, unsubscribe and remove each report the person, once", async () => {
		const seen: string[] = [];
		const { app, store } = setup("alice", async (s) => {
			seen.push(s);
		});
		await post(app, PUSH_PATHS.subscribe, subscribe(["requests"]));
		await post(app, PUSH_PATHS.unsubscribe, { endpoint: ENDPOINT, auth: KEYS.auth });
		expect(seen).toEqual(["alice", "alice"]);
		await post(app, PUSH_PATHS.subscribe, subscribe(["requests"]));
		const saved = await store.byEndpoint(ENDPOINT);
		await app.request(PUSH_PATHS.removeDevice, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN },
			body: new URLSearchParams({ id: saved?.id ?? "", locale: "ro" }).toString(),
		});
		expect(seen).toEqual(["alice", "alice", "alice", "alice"]);
	});

	it("an anonymous change reports nobody", async () => {
		const seen: string[] = [];
		const { app } = setup(null, async (s) => {
			seen.push(s);
		});
		await post(app, PUSH_PATHS.subscribe, subscribe(["booking"]));
		expect(seen).toEqual([]);
	});

	it("a failing report never blocks the person's action", async () => {
		const { app, store } = setup("alice", async () => {
			throw new Error("novu down");
		});
		const res = await post(app, PUSH_PATHS.subscribe, subscribe(["requests"]));
		expect(res.status).toBe(200);
		expect((await store.byEndpoint(ENDPOINT))?.topics).toEqual(["requests"]);
	});
});
