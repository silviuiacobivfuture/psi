import { createHmac } from "node:crypto";
import {
	memoryPushStore,
	type PushPayload,
	type PushTransport,
	type SendResult,
	type SubscriptionRecord,
} from "@psi/pwa";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CATALOGUE } from "../catalogue";
import { type FakeNovu, startFakeNovu } from "../testing/fake-novu";
import { createDeviceSync } from "./devices";
import { createPushHook, NOVU_SIGNATURE_HEADER, routeOf } from "./hook";

const SECRET = "h".repeat(40);
const KEYS = { p256dh: `B${"p".repeat(86)}`, auth: "a".repeat(22) };

async function device(
	store: ReturnType<typeof memoryPushStore>,
	n: number,
	over: {
		topics?: SubscriptionRecord["topics"];
		site?: SubscriptionRecord["site"];
		locale?: "ro" | "en";
		subject?: string | null;
	} = {},
) {
	return store.upsert(
		{
			endpoint: `https://fcm.googleapis.com/fcm/send/d${n}`,
			...KEYS,
			site: over.site ?? "psizone",
			locale: over.locale ?? "ro",
			topics: over.topics ?? ["requests"],
			subject: over.subject === undefined ? "alice" : over.subject,
		},
		1000,
	);
}

function setup(result: SendResult = { ok: true, status: 201 }) {
	const store = memoryPushStore();
	const sent: Array<{ endpoint: string; payload: PushPayload }> = [];
	const transport: PushTransport = {
		async send(to, payload) {
			sent.push({ endpoint: to.endpoint, payload });
			return result;
		},
	};
	const app = createPushHook({
		secret: SECRET,
		store,
		transport,
		site: "psizone",
		now: () => 5000,
	});
	return { app, store, sent };
}

const body = (target: string[], event = "request.new", audience = "team") =>
	JSON.stringify({
		target,
		title: "Psizone",
		content: "Ai o notificare nouă.",
		messageId: "m1",
		payload: { name: "Maria Test", meta: { event, audience, channels: { push: true } } },
	});
const sign = (raw: string, secret = SECRET): string =>
	createHmac("sha256", secret).update(raw).digest("hex");
const post = (
	app: ReturnType<typeof setup>["app"],
	raw: string,
	signature: string | null = sign(raw),
) =>
	app.request("/", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			...(signature ? { [NOVU_SIGNATURE_HEADER]: signature } : {}),
		},
		body: raw,
	});

describe("push hook: what is delivered", () => {
	it("a new request reaches the team member's device as the worker's own kind, with no name or reference", async () => {
		const { app, store, sent } = setup();
		const d = await device(store, 1);
		const res = await post(app, body([d.id]));
		expect(await res.json()).toEqual({ sent: 1, skipped: 0, removed: 0, failed: 0 });
		expect(sent).toEqual([
			{
				endpoint: d.endpoint,
				payload: {
					v: 1,
					kind: "clinic.request",
					locale: "ro",
					url: "/requests",
					tag: "clinic-request",
				},
			},
		]);
		expect(JSON.stringify(sent)).not.toContain("Maria");
		expect((await store.byEndpoint(d.endpoint))?.failures).toBe(0);
	});

	it("each device gets its own language", async () => {
		const { app, store, sent } = setup();
		const a = await device(store, 1, { locale: "ro" });
		const b = await device(store, 2, { locale: "en" });
		await post(app, body([a.id, b.id]));
		expect(sent.map((s) => s.payload.locale)).toEqual(["ro", "en"]);
	});

	it("a client's confirmation leads to the account page in the device's language", async () => {
		const { app, store, sent } = setup();
		const ro = await device(store, 1, { topics: ["booking"], locale: "ro" });
		const en = await device(store, 2, { topics: ["booking"], locale: "en" });
		await post(app, body([ro.id, en.id], "appointment.confirmed", "client"));
		expect(sent.map((s) => [s.payload.kind, s.payload.url])).toEqual([
			["booking.confirmed", "/cont"],
			["booking.confirmed", "/en/cont"],
		]);
	});

	it("a duplicate token is pushed once", async () => {
		const { app, store, sent } = setup();
		const d = await device(store, 1);
		await post(app, body([d.id, d.id]));
		expect(sent).toHaveLength(1);
	});
});

describe("push hook: refusals send nothing", () => {
	it("a missing, wrong, truncated or non-hex signature", async () => {
		const { app, store, sent } = setup();
		const d = await device(store, 1);
		const raw = body([d.id]);
		for (const sig of [
			null,
			sign(raw, "x".repeat(40)),
			sign(raw).slice(0, 60),
			"zz".repeat(32),
			"",
		])
			expect((await post(app, raw, sig)).status, String(sig)).toBe(401);
		expect(sent).toHaveLength(0);
	});
	it("a body signed for other bytes", async () => {
		const { app, store, sent } = setup();
		const d = await device(store, 1);
		expect((await post(app, body([d.id]), sign(body(["other"])))).status).toBe(401);
		expect(sent).toHaveLength(0);
	});
	it("malformed JSON and a body that is not Novu's", async () => {
		const { app } = setup();
		expect((await post(app, "{nope")).status).toBe(400);
		expect((await post(app, JSON.stringify({ target: "x" }))).status).toBe(400);
		expect(
			(
				await post(
					app,
					JSON.stringify({ target: ["a"], payload: { meta: { event: "x", audience: "team" } } }),
				)
			).status,
		).toBe(400);
	});
	it("a device that did not ask for this purpose, another site's device, an unknown token", async () => {
		const { app, store, sent } = setup();
		const other = await device(store, 1, { topics: ["appointments"] });
		const elsewhere = await device(store, 2, { site: "hemisync" });
		const res = await post(app, body([other.id, elsewhere.id, "nope"]));
		expect(await res.json()).toEqual({ sent: 0, skipped: 3, removed: 0, failed: 0 });
		expect(sent).toHaveLength(0);
	});
	it("an event that is never pushed to that audience", async () => {
		const { app, store, sent } = setup();
		const d = await device(store, 1, { topics: ["booking", "requests"] });
		const res = await post(app, body([d.id], "payment.recorded", "client"));
		expect(await res.json()).toEqual({ sent: 0, skipped: 1, removed: 0, failed: 0 });
		expect(sent).toHaveLength(0);
	});
});

describe("push hook: the push service's answers", () => {
	it("a gone device is forgotten", async () => {
		const { app, store } = setup({ ok: false, gone: true, status: 410 });
		const d = await device(store, 1);
		const res = await post(app, body([d.id]));
		expect(await res.json()).toMatchObject({ removed: 1 });
		expect(await store.byEndpoint(d.endpoint)).toBeNull();
	});
	it("a failing send counts against the device and answers 502 so Novu retries", async () => {
		const { app, store } = setup({ ok: false, gone: false, status: 500 });
		const d = await device(store, 1);
		const res = await post(app, body([d.id]));
		expect(res.status).toBe(502);
		expect((await store.byEndpoint(d.endpoint))?.failures).toBe(1);
	});
});

describe("push routes", () => {
	it("every catalogue entry that declares push has a route whose topic matches its purpose", () => {
		for (const e of CATALOGUE.filter((x) => x.channels.includes("push"))) {
			const route = routeOf(e.event, e.audience);
			expect(route, `${e.event}/${e.audience}`).toBeDefined();
			expect(route?.topic, `${e.event}/${e.audience}`).toBe(
				e.audience === "client" ? "booking" : e.push,
			);
		}
	});
	it("no route exists for an entry without push", () => {
		for (const e of CATALOGUE.filter((x) => !x.channels.includes("push")))
			expect(routeOf(e.event, e.audience), `${e.event}/${e.audience}`).toBeUndefined();
	});
	it("no route's url carries a reference", () => {
		for (const e of CATALOGUE) {
			const url = routeOf(e.event, e.audience)?.url("ro");
			if (url !== undefined) expect(url).toMatch(/^\/[a-z/-]*$/);
		}
	});
});

describe("device tokens in Novu", () => {
	let novu: FakeNovu;
	beforeEach(async () => {
		novu = await startFakeNovu();
	});
	afterEach(async () => {
		await novu.close();
	});

	it("sets the person's subscription ids as push-webhook device tokens, only of this site and with a purpose", async () => {
		const store = memoryPushStore();
		const a = await device(store, 1);
		const b = await device(store, 2, { topics: ["booking"] });
		await device(store, 3, { site: "hemisync" });
		await device(store, 4, { topics: ["articles:psizone"] });
		await device(store, 5, { subject: "bob" });
		await createDeviceSync({
			novu: { apiUrl: novu.url, secretKey: "k" },
			store,
			app: "psizone",
			site: "psizone",
			subscriberOf: async (s) => s,
		})("alice");
		const put = novu.requests.find((r) => r.method === "PUT");
		expect(put?.path).toBe("/v1/subscribers/alice/credentials");
		const sentBody = put?.body as {
			providerId: string;
			integrationIdentifier: string;
			credentials: { deviceTokens: string[] };
		};
		expect(sentBody.providerId).toBe("push-webhook");
		expect(sentBody.integrationIdentifier).toBe("push-webhook-psizone");
		expect([...sentBody.credentials.deviceTokens].sort()).toEqual([a.id, b.id].sort());
	});

	it("after the last device is removed the list is empty, not stale", async () => {
		const store = memoryPushStore();
		const sync = createDeviceSync({
			novu: { apiUrl: novu.url, secretKey: "k" },
			store,
			app: "psizone",
			site: "psizone",
			subscriberOf: async (s) => s,
		});
		await sync("alice");
		expect(
			(
				novu.requests.find((r) => r.method === "PUT")?.body as {
					credentials: { deviceTokens: string[] };
				}
			).credentials.deviceTokens,
		).toEqual([]);
	});

	it("a subject that is not a notified person is left alone", async () => {
		const store = memoryPushStore();
		await createDeviceSync({
			novu: { apiUrl: novu.url, secretKey: "k" },
			store,
			app: "psizone",
			site: "psizone",
			subscriberOf: async () => undefined,
		})("alice");
		expect(novu.requests).toHaveLength(0);
	});

	it("a Novu refusal surfaces to the caller (which swallows it) and sends no partial state", async () => {
		novu.script = (r) => (r.method === "PUT" ? { status: 500 } : undefined);
		const store = memoryPushStore();
		await expect(
			createDeviceSync({
				novu: { apiUrl: novu.url, secretKey: "k" },
				store,
				app: "psizone",
				site: "psizone",
				subscriberOf: async (s) => s,
			})("alice"),
		).rejects.toThrow("Novu answered 500");
	});
});
