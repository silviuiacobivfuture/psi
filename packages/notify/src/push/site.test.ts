import { createHmac } from "node:crypto";
import { memoryPushStore, type PushPayload, type PushTransport } from "@psi/pwa";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { accountClientId, clientSubscriberId } from "../identity";
import { type FakeNovu, startFakeNovu } from "../testing/fake-novu";
import { mountPushHook, NOVU_PUSH_PATH, readNovuPush, syncDevices } from "./site";

const KEYS = { p256dh: `B${"p".repeat(86)}`, auth: "a".repeat(22) };
const SECRET = "s".repeat(40);

let novu: FakeNovu;
beforeEach(async () => {
	novu = await startFakeNovu();
});
afterEach(async () => {
	await novu.close();
});

describe("a site's Novu push settings", () => {
	it("none at all is push off; the API and its key make it on, the webhook secret optional", () => {
		expect(readNovuPush({})).toBeNull();
		expect(
			readNovuPush({ NOVU_API_URL: "https://novu.test", NOVU_SECRET_KEY: "k".repeat(12) }),
		).toEqual({ apiUrl: "https://novu.test", secretKey: "k".repeat(12), pushSecret: null });
		expect(
			readNovuPush({
				NOVU_API_URL: "https://novu.test",
				NOVU_SECRET_KEY: "k".repeat(12),
				NOVU_PUSH_SECRET: SECRET,
			})?.pushSecret,
		).toBe(SECRET);
	});

	it.each([
		["the key without the API", { NOVU_SECRET_KEY: "k".repeat(12) }],
		["the API without the key", { NOVU_API_URL: "https://novu.test" }],
		["the webhook secret alone", { NOVU_PUSH_SECRET: SECRET }],
		["an API that is not a URL", { NOVU_API_URL: "novu", NOVU_SECRET_KEY: "k".repeat(12) }],
	])("refuses %s loudly", (_label, env) => {
		expect(() => readNovuPush(env)).toThrow();
	});
});

describe("a client's devices kept in step with Novu", () => {
	it("puts the person's booking devices of this site under the account's client subscriber, and nothing else", async () => {
		const store = memoryPushStore();
		await store.upsert(
			{
				endpoint: "https://push.test/d1",
				...KEYS,
				site: "psizone",
				locale: "ro",
				topics: ["booking"],
				subject: "ana",
			},
			1,
		);
		await store.upsert(
			{
				endpoint: "https://push.test/d2",
				...KEYS,
				site: "hemisync",
				locale: "ro",
				topics: ["booking"],
				subject: "ana",
			},
			1,
		);
		await store.upsert(
			{
				endpoint: "https://push.test/d3",
				...KEYS,
				site: "psizone",
				locale: "ro",
				topics: ["articles:psizone"],
				subject: "ana",
			},
			1,
		);
		const subscriber = clientSubscriberId("psizone", accountClientId("hash-of-ana"));
		await syncDevices(
			{ apiUrl: novu.url, secretKey: "k".repeat(12) },
			{ store: async () => store },
			"psizone",
			["psizone"],
			() => subscriber,
		)("ana");
		const put = novu.requests.find((r) => r.method === "PUT");
		expect(put?.path).toBe(`/v1/subscribers/${encodeURIComponent(subscriber)}/credentials`);
		const tokens = (put?.body as { credentials: { deviceTokens: string[] } }).credentials
			.deviceTokens;
		const own = (await store.forSubject("ana")).filter(
			(d) => d.site === "psizone" && d.topics.includes("booking"),
		);
		expect(tokens).toEqual(own.map((d) => d.id));
	});

	it("an app the person is not a subscriber of is skipped: nothing is sent to Novu", async () => {
		const store = memoryPushStore();
		await syncDevices(
			{ apiUrl: novu.url, secretKey: "k".repeat(12) },
			{ store: async () => store },
			"psizone",
			["psizone"],
			() => undefined,
		)("ana");
		expect(novu.requests).toEqual([]);
	});
});

describe("the push webhook on a site", () => {
	const transport = (sent: PushPayload[]): PushTransport => ({
		async send(_to, payload) {
			sent.push(payload);
			return { ok: true, status: 201 };
		},
	});

	it("is mounted only with a webhook secret, and delivers a client's confirmation to their booking device", async () => {
		const store = memoryPushStore();
		const device = await store.upsert(
			{
				endpoint: "https://push.test/d9",
				...KEYS,
				site: "psizone",
				locale: "ro",
				topics: ["booking"],
				subject: "ana",
			},
			1,
		);
		const sent: PushPayload[] = [];
		const pwa = { store: async () => store, transport: () => transport(sent) };
		const bare = new Hono();
		expect(mountPushHook(bare, pwa, null, "psizone")).toBe(false);
		expect(
			mountPushHook(bare, pwa, { apiUrl: novu.url, secretKey: "k", pushSecret: null }, "psizone"),
		).toBe(false);
		const hono = new Hono();
		expect(
			mountPushHook(hono, pwa, { apiUrl: novu.url, secretKey: "k", pushSecret: SECRET }, "psizone"),
		).toBe(true);
		const body = JSON.stringify({
			target: [device.id],
			payload: { meta: { event: "appointment.confirmed", audience: "client" } },
		});
		const signature = createHmac("sha256", SECRET).update(body).digest("hex");
		const res = await hono.request(NOVU_PUSH_PATH, {
			method: "POST",
			body,
			headers: { "x-novu-signature": signature },
		});
		expect(res.status).toBe(200);
		expect(sent).toEqual([expect.objectContaining({ kind: "booking.confirmed", url: "/cont" })]);
		expect((await bare.request(NOVU_PUSH_PATH, { method: "POST", body })).status).toBe(404);
	});
});
