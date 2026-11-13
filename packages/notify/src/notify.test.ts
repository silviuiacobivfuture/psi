import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { APP_DEFAULTS, type AppSettings } from "./apps";
import { clientSubscriberId, subscriberHash, topicKey } from "./identity";
import { createNotifier, idempotencyKey, type Notifier, type Recipient } from "./notify";
import { createMemoryOutbox, type Outbox } from "./outbox";
import { type FakeNovu, startFakeNovu } from "./testing/fake-novu";
import { SAMPLES } from "./testing/samples";

const NOON = Date.parse("2026-11-20T10:00:00Z"); // 12:00 in Bucharest
const NIGHT = Date.parse("2026-11-20T22:00:00Z"); // 00:00 in Bucharest, quiet

const client: Recipient = {
	audience: "client",
	clientId: "cli_1",
	email: "ana.popescu@example.test",
	name: "Ana",
	phone: "+40700000000",
	locale: "ro",
};

let novu: FakeNovu;
let lines: string[];
let clock: { now: number };
let outbox: Outbox;

function build(over: Partial<AppSettings> = {}, apps = true): Notifier {
	return createNotifier({
		novu: { apiUrl: novu.url, secretKey: "sk_test_secret" },
		apps: apps
			? {
					psizone: {
						settings: { ...APP_DEFAULTS.psizone, ...over },
						siteUrl: "https://psizone.example",
						consoleUrl: "https://clinic.example",
					},
				}
			: {},
		outbox,
		now: () => clock.now,
		log: (l) => lines.push(JSON.stringify(l)),
		backoffMs: 1000,
		maxAttempts: 3,
	});
}

beforeEach(async () => {
	novu = await startFakeNovu();
	lines = [];
	clock = { now: NOON };
	outbox = createMemoryOutbox();
});
afterEach(async () => {
	await novu.close();
});

const triggers = () => novu.requests.filter((r) => r.path === "/v1/events/trigger");

describe("notify: delivery", () => {
	it("queues without calling Novu, then drain delivers one trigger with the workflow, recipient, payload and sender overrides", async () => {
		const n = build();
		expect(
			await n.notify("psizone", "appointment.confirmed", SAMPLES["appointment.confirmed"], [
				client,
			]),
		).toEqual({ status: "queued", jobs: 1 });
		expect(triggers()).toHaveLength(0);
		expect(await n.pending()).toBe(1);
		expect(await n.drain()).toBe(1);
		expect(await n.pending()).toBe(0);
		const sent = triggers()[0];
		expect(sent?.headers.authorization).toBe("ApiKey sk_test_secret");
		const body = sent?.body as Record<string, unknown>;
		expect(body.name).toBe("psizone-appointment-confirmed-client");
		expect(body.to).toMatchObject({
			subscriberId: "psizone:client:cli_1",
			email: "ana.popescu@example.test",
			locale: "ro",
		});
		expect(body.payload).toMatchObject({
			appointmentId: "apt_1",
			meta: { channels: { email: true, push: true, in_app: false }, brandName: "Psizone" },
		});
		expect(body.overrides).toEqual({
			email: {
				integrationIdentifier: "plunk-psizone",
				replyTo: "programari@psizone.ro",
				senderName: "Psizone",
			},
		});
	});

	it("addresses a team through its topic, not a list of people", async () => {
		const n = build();
		const out = await n.notify("psizone", "request.new", SAMPLES["request.new"], [
			{ audience: "team" },
		]);
		expect(out).toEqual({ status: "queued", jobs: 1 });
		await n.drain();
		expect((triggers()[0]?.body as { to: unknown }).to).toEqual({
			type: "Topic",
			topicKey: "psizone:team",
		});
	});

	it("one event to a client and a practitioner makes two deliveries with two workflows", async () => {
		const n = build();
		const out = await n.notify(
			"psizone",
			"appointment.confirmed",
			SAMPLES["appointment.confirmed"],
			[client, { audience: "practitioner", subject: "sub-1" }],
		);
		expect(out).toEqual({ status: "queued", jobs: 2 });
		await n.drain();
		expect(
			triggers()
				.map((t) => (t.body as { name: string }).name)
				.sort(),
		).toEqual([
			"psizone-appointment-confirmed-client",
			"psizone-appointment-confirmed-practitioner",
		]);
	});
});

describe("notify: idempotency", () => {
	it("the same event twice is one job and one delivery", async () => {
		const n = build();
		await n.notify("psizone", "appointment.confirmed", SAMPLES["appointment.confirmed"], [client]);
		await n.notify("psizone", "appointment.confirmed", SAMPLES["appointment.confirmed"], [client]);
		expect(await n.pending()).toBe(1);
		await n.drain();
		expect(triggers()).toHaveLength(1);
	});

	it("a retry after the first was delivered is sent with the same key, and Novu accepts it once", async () => {
		const n = build();
		await n.notify("psizone", "appointment.confirmed", SAMPLES["appointment.confirmed"], [client]);
		await n.drain();
		await n.notify("psizone", "appointment.confirmed", SAMPLES["appointment.confirmed"], [client]);
		await n.drain();
		expect(triggers()).toHaveLength(2);
		expect(triggers()[0]?.headers["idempotency-key"]).toBe(
			triggers()[1]?.headers["idempotency-key"],
		);
		expect(novu.accepted).toHaveLength(1);
	});

	it("a different time, recipient, event or occurrence gets a different key", () => {
		const base = SAMPLES["appointment.moved"];
		const k = (p: Record<string, unknown>, who = "a", occ = "") =>
			idempotencyKey("psizone", "appointment.moved", "client", p, who, occ);
		expect(k(base)).toBe(k({ ...base }));
		expect(k(base)).not.toBe(k({ ...base, startsAt: "2026-12-02T08:00:00.000Z" }));
		expect(k(base)).not.toBe(k(base, "b"));
		expect(k(base)).not.toBe(k(base, "a", "2"));
		expect(k(base)).not.toBe(k({ ...base, appointmentId: "apt_2" }));
		expect(idempotencyKey("hemisync", "appointment.moved", "client", base, "a")).not.toBe(k(base));
	});
});

describe("notify: retry and failure", () => {
	it("a refusal Novu keeps under the key is walked past with :r1, and the notification is delivered", async () => {
		novu.script = (_r, attempt) => (attempt === 1 ? { status: 503 } : undefined);
		const n = build();
		await n.notify("psizone", "appointment.confirmed", SAMPLES["appointment.confirmed"], [client]);
		expect(await n.drain()).toBe(0); // 503: the key now holds the refusal
		expect(await n.drain()).toBe(0); // not yet due
		clock.now += 1000;
		expect(await n.drain()).toBe(0); // same key: Novu replays the refusal
		clock.now += 2000;
		expect(await n.drain()).toBe(1); // the walked key is new
		const keys = triggers().map((t) => String(t.headers["idempotency-key"]));
		expect(keys).toHaveLength(3);
		expect(keys[1]).toBe(keys[0]);
		expect(keys[2]).toBe(`${keys[0]}:r1`);
		expect(await n.pending()).toBe(0);
		expect(novu.accepted).toHaveLength(1);
	});

	it("backoff doubles", async () => {
		novu.script = () => ({ status: 500 });
		const n = build();
		await n.notify("psizone", "appointment.confirmed", SAMPLES["appointment.confirmed"], [client]);
		await n.drain();
		clock.now += 1000;
		await n.drain();
		clock.now += 1000;
		expect(await n.drain()).toBe(0);
		expect(triggers()).toHaveLength(2); // second retry waits 2000
		clock.now += 1000;
		await n.drain();
		expect(await n.pending()).toBe(0); // third attempt: given up (maxAttempts 3)
		expect(lines.some((l) => l.includes("given up"))).toBe(true);
	});

	it("a 400 is not retried", async () => {
		novu.script = () => ({ status: 400 });
		const n = build();
		await n.notify("psizone", "appointment.confirmed", SAMPLES["appointment.confirmed"], [client]);
		await n.drain();
		expect(await n.pending()).toBe(0);
		expect(triggers()).toHaveLength(1);
	});

	it("a 429 is retried", async () => {
		novu.script = (_r, attempt) => (attempt === 1 ? { status: 429 } : undefined);
		const n = build();
		await n.notify("psizone", "appointment.confirmed", SAMPLES["appointment.confirmed"], [client]);
		await n.drain();
		expect(await n.pending()).toBe(1);
	});

	it("Novu answering 2xx without 'processed' (workflow not active) is a refusal, not a delivery", async () => {
		novu.script = () => ({
			status: 201,
			body: { data: { acknowledged: true, status: "no_workflow_active_steps_defined" } },
		});
		const n = build();
		await n.notify("psizone", "appointment.confirmed", SAMPLES["appointment.confirmed"], [client]);
		expect(await n.drain()).toBe(0);
		expect(await n.pending()).toBe(0);
	});

	it("an unreachable Novu does not throw to the caller and the job waits", async () => {
		await novu.close();
		const n = build();
		const out = await n.notify(
			"psizone",
			"appointment.confirmed",
			SAMPLES["appointment.confirmed"],
			[client],
		);
		expect(out.status).toBe("queued");
		expect(await n.drain()).toBe(0);
		expect(await n.pending()).toBe(1);
		novu = await startFakeNovu();
	});

	it("an outbox that fails to store does not throw to the caller", async () => {
		const broken: Outbox = {
			...createMemoryOutbox(),
			add: () => Promise.reject(new Error("disk full")),
		};
		const n = createNotifier({
			novu: { apiUrl: novu.url, secretKey: "k" },
			apps: {
				psizone: {
					settings: APP_DEFAULTS.psizone,
					siteUrl: "https://a.example",
					consoleUrl: "https://b.example",
				},
			},
			outbox: broken,
			now: () => NOON,
			log: (l) => lines.push(JSON.stringify(l)),
		});
		await expect(
			n.notify("psizone", "appointment.confirmed", SAMPLES["appointment.confirmed"], [client]),
		).resolves.toMatchObject({ status: "invalid" });
	});
});

describe("notify: no personal data in logs", () => {
	it("failures, retries and give-ups log ids and counts, never an address, a name, a phone, a payload or the key", async () => {
		novu.script = () => ({ status: 500 });
		const n = build();
		await n.notify(
			"psizone",
			"appointment.confirmed",
			{ ...SAMPLES["appointment.confirmed"], clientName: "Ana Popescu" },
			[client],
		);
		for (let i = 0; i < 4; i++) {
			await n.drain();
			clock.now += 60_000;
		}
		await n.notify("psizone", "appointment.confirmed", { clientName: "Bad" }, [client]);
		const all = lines.join("\n");
		expect(lines.length).toBeGreaterThan(1);
		for (const secret of [
			"ana.popescu",
			"Ana",
			"Popescu",
			"+4070",
			"cli_1",
			"sk_test_secret",
			"Terapie",
			"apt_1",
		])
			expect(all).not.toContain(secret);
	});
});

describe("notify: refusals send nothing", () => {
	const expectNothing = async (n: Notifier) => {
		expect(await n.pending()).toBe(0);
		await n.drain();
		expect(novu.requests).toHaveLength(0);
	};
	it("an invalid payload", async () => {
		const n = build();
		expect(
			await n.notify("psizone", "appointment.confirmed", { appointmentId: "x" }, [client]),
		).toEqual({ status: "invalid", reason: "payload" });
		await expectNothing(n);
	});
	it("an app that was never configured", async () => {
		const n = build({}, false);
		expect(
			await n.notify("psizone", "request.new", SAMPLES["request.new"], [{ audience: "team" }]),
		).toEqual({ status: "invalid", reason: "unknown-app" });
		await expectNothing(n);
	});
	it("an event the app switched off", async () => {
		const n = build({ off: ["request.new"] });
		expect(
			await n.notify("psizone", "request.new", SAMPLES["request.new"], [{ audience: "team" }]),
		).toEqual({ status: "off", reason: "event-off" });
		await expectNothing(n);
	});
	it("a receipt when the app did not turn receipts on", async () => {
		const n = build();
		expect(
			await n.notify("psizone", "payment.recorded", SAMPLES["payment.recorded"], [client]),
		).toEqual({ status: "off", reason: "receipts-off" });
		await expectNothing(n);
		const on = build({ receipts: true });
		expect(
			(await on.notify("psizone", "payment.recorded", SAMPLES["payment.recorded"], [client]))
				.status,
		).toBe("queued");
	});
	it("a recipient the event has no workflow for", async () => {
		const n = build({ receipts: true });
		expect(
			await n.notify("psizone", "payment.recorded", SAMPLES["payment.recorded"], [
				{ audience: "reception" },
			]),
		).toEqual({ status: "invalid", reason: "recipient" });
	});
	it("an empty recipient list", async () => {
		const n = build();
		expect(await n.notify("psizone", "request.new", SAMPLES["request.new"], [])).toEqual({
			status: "off",
			reason: "no-channel",
		});
	});
});

describe("notify: quiet hours", () => {
	it("hold the push back at night but keep the bell and the e-mail", async () => {
		clock.now = NIGHT;
		const n = build();
		await n.notify("psizone", "request.new", SAMPLES["request.new"], [{ audience: "team" }]);
		await n.drain();
		const meta = (triggers()[0]?.body as { payload: { meta: { channels: unknown } } }).payload.meta
			.channels;
		expect(meta).toEqual({ in_app: true, push: false, email: true });
	});
	it("allow the push by day", async () => {
		const n = build();
		await n.notify("psizone", "request.new", SAMPLES["request.new"], [{ audience: "team" }]);
		await n.drain();
		expect(
			(triggers()[0]?.body as { payload: { meta: { channels: { push: boolean } } } }).payload.meta
				.channels.push,
		).toBe(true);
	});
	it("an app with no quiet hours pushes at night", async () => {
		clock.now = NIGHT;
		const n = build({ quietHours: null });
		await n.notify("psizone", "request.new", SAMPLES["request.new"], [{ audience: "team" }]);
		await n.drain();
		expect(
			(triggers()[0]?.body as { payload: { meta: { channels: { push: boolean } } } }).payload.meta
				.channels.push,
		).toBe(true);
	});
});

describe("subscribers and topics", () => {
	it("upserts a client with email, phone and locale under its app-scoped id", async () => {
		await build().upsertSubscriber("psizone", client);
		const r = novu.requests[0];
		expect(r?.path).toBe("/v2/subscribers");
		expect(r?.body).toEqual({
			subscriberId: "psizone:client:cli_1",
			email: "ana.popescu@example.test",
			firstName: "Ana",
			phone: "+40700000000",
			locale: "ro",
		});
	});
	it("moves members in and out of an app team's v2 topic subscriptions, skipping empty lists", async () => {
		await build().setTeam("psizone", "reception", ["u1", "u2"], ["u3"]);
		expect(novu.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
			"POST /v2/topics/psizone%3Areception/subscriptions",
			"DELETE /v2/topics/psizone%3Areception/subscriptions",
		]);
		expect((novu.requests[0]?.body as { subscriberIds: string[] }).subscriberIds).toEqual([
			"u1",
			"u2",
		]);
		expect((novu.requests[1]?.body as { subscriberIds: string[] }).subscriberIds).toEqual(["u3"]);
		novu.requests.length = 0;
		await build().setTeam("psizone", "owners", [], []);
		expect(novu.requests).toHaveLength(0);
	});
	it("a refused upsert reports to its caller", async () => {
		novu.script = () => ({ status: 401 });
		await expect(build().upsertSubscriber("psizone", client)).rejects.toThrow("Novu answered 401");
	});
});

describe("identity", () => {
	it("ids and topics are app-scoped", () => {
		expect(clientSubscriberId("hemisync", "7")).toBe("hemisync:client:7");
		expect(topicKey("psizone", "owners")).toBe("psizone:owners");
	});
	it("the inbox hash is Novu's HMAC-SHA256 of the subscriber id", () => {
		expect(subscriberHash("k", "u1")).toBe(createHmac("sha256", "k").update("u1").digest("hex"));
		expect(subscriberHash("k", "u1")).not.toBe(subscriberHash("k", "u2"));
		expect(subscriberHash("k", "u1")).not.toBe(subscriberHash("k2", "u1"));
	});
});
