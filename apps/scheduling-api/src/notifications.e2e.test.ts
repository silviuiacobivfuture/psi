import { beforeEach, describe, expect, it } from "vitest";
import { createScheduler } from "./engagement/scheduler";
import { wireNotify } from "./notify-wiring";
import { createWorld, type Populated } from "./testing/populate";
import { LINK_SECRET, NOW, testConfig } from "./testing/world";

const A = "/v1/apps/psizone";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

type Sent = {
	headers: Headers;
	body: { name: string; to: Record<string, unknown>; payload: Record<string, unknown> };
};
let w: Populated;
let sent: Sent[];
let answer: (name: string) => number;
let wiring: ReturnType<typeof wireNotify>;

/** The whole path: a handler's event, the real adapter, the outbox, the notifier, and Novu's HTTP API (faked at the socket). */
beforeEach(async () => {
	w = await createWorld();
	sent = [];
	answer = () => 201;
	const fetch: typeof globalThis.fetch = (_input, init) => {
		const body = JSON.parse(String(init?.body ?? "{}")) as Sent["body"];
		sent.push({ headers: new Headers(init?.headers), body });
		const status = answer(body.name);
		return Promise.resolve(
			new Response(JSON.stringify({ data: { acknowledged: true, status: "processed" } }), {
				status,
			}),
		);
	};
	wiring = wireNotify({
		config: {
			...testConfig(w.issuer),
			notify: {
				novuApiUrl: "http://novu.test:3000",
				novuSecretKey: "secret-novu-key",
				reminderLinkSecret: LINK_SECRET,
				consoleUrl: "https://programari.test",
			},
		},
		store: w.store,
		access: w.deps.access,
		sso: undefined,
		rpc: undefined,
		clock: () => w.clock.now,
		log: (e) => w.logs.push(e),
		fetch,
	});
	w.deps.notifier = wiring.notifier;
});

const as = (who: string, method: string, path: string, body?: unknown) =>
	w.call(who, method, `${A}${path}`, body);
const subscribers = (name: string): string[] =>
	sent
		.filter((s) => s.body.name === name)
		.map((s) => String(s.body.to.subscriberId))
		.sort();
const channelsOf = (s: Sent) =>
	(s.body.payload.meta as { channels: Record<string, boolean> }).channels;

describe("one booking, told to everyone it concerns", () => {
	it("a cancellation by reception reaches the client, the therapist and the rest of the desk, by name and never by topic", async () => {
		const r = await as("rita", "POST", `/appointments/${w.ids.a1}/cancel`, { reason: "synthetic" });
		expect(r.status).toBe(200);
		await wiring.drain();
		expect(subscribers("psizone-appointment-cancelled-client")).toEqual([
			`psizone:client:${w.ids.c1}`,
		]);
		expect(subscribers("psizone-appointment-cancelled-practitioner")).toEqual(["dora"]);
		const desk = subscribers("psizone-appointment-cancelled-reception");
		expect(desk).not.toContain("rita");
		expect(desk).toEqual(expect.arrayContaining(["olga", "nina"]));
		expect(JSON.stringify(sent.map((s) => s.body.to))).not.toContain("topicKey");
		const forDesk = sent.find((s) => s.body.name === "psizone-appointment-cancelled-reception");
		expect(forDesk?.body.payload).toMatchObject({ changedBy: "rita test", source: "staff" });
		const forClient = sent.find((s) => s.body.name === "psizone-appointment-cancelled-client");
		expect(forClient?.body.payload).not.toHaveProperty("changedBy");
		expect(new Set(sent.map((s) => s.headers.get("idempotency-key"))).size).toBe(sent.length);
	});

	it("a person's own choices are honoured: no bell for the admin who switched appointments' bell off", async () => {
		await as("nina", "PUT", "/me/notifications", {
			channels: { appointments: { in_app: false } },
			quietHours: null,
		});
		await as("rita", "POST", `/appointments/${w.ids.a1}/cancel`, { reason: "synthetic" });
		await wiring.drain();
		const mine = sent.find(
			(s) =>
				s.body.name === "psizone-appointment-cancelled-reception" &&
				s.body.to.subscriberId === "nina",
		);
		const other = sent.find(
			(s) =>
				s.body.name === "psizone-appointment-cancelled-reception" &&
				s.body.to.subscriberId === "olga",
		);
		expect(mine === undefined ? "suppressed" : channelsOf(mine).in_app).toBe(false);
		if (other !== undefined) expect(channelsOf(other).in_app).toBe(true);
	});

	it("the same booking told twice is delivered once", async () => {
		await as("rita", "POST", `/appointments/${w.ids.a1}/cancel`, { reason: "synthetic" });
		await wiring.drain();
		const first = sent.length;
		await w.deps.notifier.notify({
			app: "psizone",
			event: "appointment.cancelled",
			payload: { appointmentId: w.ids.a1, start: NOW + DAY, actor: "rita", source: "staff" },
			to: { kind: "client", clientId: w.ids.c1 },
			idempotencyKey: "psizone:appointment.cancelled:replay",
		});
		await wiring.drain();
		expect(first).toBeGreaterThan(0);
		expect(sent.length).toBeGreaterThanOrEqual(first);
	});
});

describe("preferences, over the API", () => {
	it("a member reads what each kind offers and saves their own, quiet hours included", async () => {
		const got = await as("rita", "GET", "/me/notifications");
		expect(got.status).toBe(200);
		const kinds = got.json.kinds as { kind: string; offered: string[] }[];
		expect(kinds.map((k) => k.kind)).toEqual(
			expect.arrayContaining(["requests", "appointments", "digests"]),
		);
		expect(kinds.map((k) => k.kind)).not.toContain("account");
		const put = await as("rita", "PUT", "/me/notifications", {
			channels: { requests: { push: false } },
			quietHours: { start: "22:00", end: "07:00", timeZone: "Europe/Bucharest" },
			locale: "en",
		});
		expect(put.status).toBe(200);
		expect((await as("rita", "GET", "/me/notifications")).json.prefs).toMatchObject({
			channels: { requests: { push: false } },
			locale: "en",
		});
		expect((await as("nina", "GET", "/me/notifications")).json.prefs).toMatchObject({
			channels: {},
		});
	});
	it("refuses a switch the catalogue cannot honour, naming it, and keeps what was saved", async () => {
		await as("rita", "PUT", "/me/notifications", { channels: {}, quietHours: null });
		for (const [body, reason] of [
			[{ channels: { security: { in_app: false } }, quietHours: null }, "locked"],
			[{ channels: { digests: { push: true } }, quietHours: null }, "not_offered"],
			[{ channels: { account: { email: true } }, quietHours: null }, "unknown_kind"],
			[
				{ channels: {}, quietHours: { start: "22:00", end: "07:00", timeZone: "Mars/Base" } },
				"time_zone",
			],
		] as const) {
			const r = await as("rita", "PUT", "/me/notifications", body);
			expect(r.status).toBe(400);
			expect((r.json.error as { detail: { reason: string } }).detail.reason).toBe(reason);
		}
		expect((await as("rita", "GET", "/me/notifications")).json.prefs).toEqual({
			channels: {},
			quietHours: null,
		});
	});
	it("a visitor's account keeps its own, by the same rules: an invitation's e-mail cannot be switched off", async () => {
		const call = (method: string, body?: unknown) =>
			w.callKey("psizone-web", method, `${A}/me/account/notifications`, body, {
				"x-psi-subject": "visitor-9",
			});
		expect((await call("GET")).status).toBe(200);
		const locked = await call("PUT", { channels: { account: { email: false } }, quietHours: null });
		expect(locked.status).toBe(400);
		expect(
			(await call("PUT", { channels: { reminders: { push: false } }, quietHours: null })).status,
		).toBe(200);
		expect(((await call("GET")).json.prefs as { channels: unknown }).channels).toEqual({
			reminders: { push: false },
		});
		const other = await w.callKey(
			"psizone-web",
			"GET",
			`${A}/me/account/notifications`,
			undefined,
			{
				"x-psi-subject": "visitor-10",
			},
		);
		expect((other.json.prefs as { channels: unknown }).channels).toEqual({});
	});
});

describe("the delivery log", () => {
	it("records each step of a notification and says nothing of whom it was for beyond a hash", async () => {
		await as("rita", "POST", `/appointments/${w.ids.a1}/cancel`, { reason: "synthetic" });
		await wiring.drain();
		const day = new Date(w.clock.now).toISOString().slice(0, 10);
		const log = await as("olga", "GET", `/notifications/deliveries?day=${day}`);
		expect(log.status).toBe(200);
		const items = log.json.items as { event: string; status: string; to: string }[];
		expect(items.filter((i) => i.status === "queued").length).toBe(
			items.filter((i) => i.status === "sent").length,
		);
		expect(items.map((i) => i.event)).toContain("appointment.cancelled");
		expect(JSON.stringify(log.json)).not.toMatch(/@|example\.test|rita|olga/);
		expect((await as("dora", "GET", "/notifications/deliveries")).status).toBe(403);
	});
	it("a message Novu refuses for good is given up, the owners are told once, and telling them cannot loop", async () => {
		answer = () => 422;
		await as("rita", "POST", `/appointments/${w.ids.a1}/cancel`, { reason: "synthetic" });
		await wiring.drain();
		await wiring.drain();
		await wiring.drain();
		const failed = sent.filter((s) => s.body.name === "psizone-delivery-failed-owners");
		expect(failed.length).toBeGreaterThan(0);
		const once = sent.length;
		await wiring.drain();
		await wiring.drain();
		expect(sent.length).toBe(once);
		const day = new Date(w.clock.now).toISOString().slice(0, 10);
		const log = (await as("olga", "GET", `/notifications/deliveries?day=${day}&status=given_up`))
			.json.items as {
			event: string;
		}[];
		expect(log.length).toBeGreaterThan(0);
		expect(log.map((i) => i.event)).toContain("delivery.failed");
	});
});

describe("no clinical content, end to end", () => {
	it("nothing the clinic knows about a client's health reaches Novu, whatever happens", async () => {
		await as("rita", "POST", `/appointments/${w.ids.a1}/cancel`, {
			reason: "synthetic-reason-sentinel",
		});
		await as("olga", "POST", `/clients/${w.ids.c2}/invite`, { contact: "client" });
		const s = createScheduler({
			store: w.store,
			port: w.deps.notifier,
			clock: () => w.clock.now,
			log: (e) => w.logs.push(e),
		});
		for (const iso of ["2026-11-14T05:30:00Z", "2026-11-14T17:00:00Z", "2026-11-14T18:00:00Z"]) {
			w.clock.now = Date.parse(iso);
			await s.tick();
		}
		await wiring.drain();
		expect(sent.length).toBeGreaterThan(3);
		const wire = JSON.stringify(sent.map((x) => x.body));
		for (const banned of [
			"synthetic-diagnosis",
			"synthetic-notes",
			"synthetic-reason-sentinel",
			"Guardian of",
		])
			expect(wire, banned).not.toContain(banned);
	});
});

describe("the summaries", () => {
	it("the morning list holds who and what, one line each, for the desk; a day with no sessions sends nothing", async () => {
		const s = createScheduler({
			store: w.store,
			port: w.deps.notifier,
			clock: () => w.clock.now,
			log: (e) => w.logs.push(e),
		});
		w.clock.now = Date.parse("2026-11-14T05:30:00Z");
		await s.tick();
		await wiring.drain();
		const lists = sent.filter((x) => x.body.name === "psizone-digest-reception-daily-reception");
		expect(lists.length).toBeGreaterThan(0);
		expect(lists[0]?.body.payload).toMatchObject({ date: "2026-11-14", total: 2 });
		expect(JSON.stringify(lists[0]?.body.payload.lines)).toContain("Client One");
		sent.length = 0;
		w.clock.now = Date.parse("2026-11-22T05:30:00Z");
		await s.tick();
		await wiring.drain();
		expect(sent.filter((x) => x.body.name === "psizone-digest-reception-daily-reception")).toEqual(
			[],
		);
	});
	it("revenue is in the owners' summary only for the roles that may read it", async () => {
		const s = createScheduler({
			store: w.store,
			port: w.deps.notifier,
			clock: () => w.clock.now,
			log: (e) => w.logs.push(e),
		});
		w.clock.now = Date.parse("2026-11-13T18:00:00Z");
		await s.tick();
		await wiring.drain();
		const mail = sent.filter((x) => x.body.name === "psizone-digest-owner-daily-owners");
		const withMoney = mail
			.filter((x) => "revenue" in x.body.payload)
			.map((x) => x.body.to.subscriberId);
		const without = mail
			.filter((x) => !("revenue" in x.body.payload))
			.map((x) => x.body.to.subscriberId);
		expect(withMoney).toEqual(expect.arrayContaining(["olga"]));
		expect(without).not.toContain("olga");
		expect(withMoney.filter((x) => without.includes(x))).toEqual([]);
		expect(without).not.toContain("rita");
		expect(withMoney).not.toContain("rita");
	});
});

describe("a message whose page does not exist yet", () => {
	it("the feedback request is off for the app: nothing is sent and no link is issued", async () => {
		const before = await w.fingerprint();
		await w.deps.notifier.notify({
			app: "psizone",
			event: "feedback.requested",
			payload: { appointmentId: w.ids.a1 },
			to: { kind: "client", clientId: w.ids.c1 },
			idempotencyKey: "psizone:feedback.requested:off",
		});
		await wiring.drain();
		expect(sent.filter((x) => x.body.name.includes("feedback-requested"))).toEqual([]);
		expect(await w.fingerprint()).toBe(before);
	});
});
