import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { APP_DEFAULTS, EVENT_IDS } from "./apps";
import { CATALOGUE, PAYLOADS } from "./catalogue";
import type { DeliveryEvent } from "./delivery";
import { createNotifier, type Notifier, type Recipient, type TeamResolver } from "./notify";
import { createMemoryOutbox, type Outbox } from "./outbox";
import type { PreferenceSource, Prefs } from "./prefs";
import { type Meta, render } from "./render";
import { type FakeNovu, startFakeNovu } from "./testing/fake-novu";
import { SAMPLES } from "./testing/samples";

const NOON = Date.parse("2026-11-20T10:00:00Z"); // 12:00 in Bucharest
const NIGHT = Date.parse("2026-11-20T22:00:00Z");

const PEOPLE = [
	{ subject: "sub-ana", email: "ana@clinic.test", name: "Ana" },
	{ subject: "sub-bia", email: "bia@clinic.test", name: "Bia" },
	{ subject: "sub-cora", email: "cora@clinic.test", name: "Cora" },
];

let novu: FakeNovu;
let outbox: Outbox;
let steps: DeliveryEvent[];
let clock: { now: number };
let chosen: Map<string, Prefs>;
let asked: string[];
let resolverCalls: Array<{ needs: string | undefined; except: string | undefined }>;

const team: TeamResolver = (_app, entry, who) => {
	resolverCalls.push({ needs: who.needs ?? entry.needs, except: who.except });
	return Promise.resolve(PEOPLE.filter((p) => p.subject !== who.except));
};
const preferences: PreferenceSource = {
	resolve(_app, owner) {
		const key = owner.side === "staff" ? owner.subject : `client:${owner.clientId}`;
		asked.push(key);
		return Promise.resolve(chosen.get(key));
	},
};

function build(over: { prefs?: PreferenceSource; failSink?: boolean } = {}): Notifier {
	return createNotifier({
		novu: { apiUrl: novu.url, secretKey: "sk_test_secret" },
		apps: {
			psizone: {
				settings: APP_DEFAULTS.psizone,
				siteUrl: "https://psizone.example",
				consoleUrl: "https://clinic.example",
			},
		},
		outbox,
		team,
		preferences: over.prefs ?? preferences,
		deliveries: {
			record: (e) => {
				if (over.failSink === true) return Promise.reject(new Error("log down"));
				steps.push(e);
				return Promise.resolve();
			},
		},
		now: () => clock.now,
		log: () => undefined,
		backoffMs: 1000,
		maxAttempts: 2,
	});
}

beforeEach(async () => {
	novu = await startFakeNovu();
	outbox = createMemoryOutbox();
	steps = [];
	clock = { now: NOON };
	chosen = new Map();
	asked = [];
	resolverCalls = [];
});
afterEach(async () => {
	await novu.close();
});

const triggers = () => novu.requests.filter((r) => r.path === "/v1/events/trigger");
const to = (): string[] =>
	triggers().map((t) => (t.body as { to: { subscriberId: string } }).to.subscriberId);
const channelsOf = (i: number) =>
	(triggers()[i]?.body as { payload: { meta: Meta } }).payload.meta.channels;

const client: Recipient = {
	audience: "client",
	clientId: "cli_1",
	email: "ana.popescu@example.test",
	name: "Ana",
	locale: "ro",
};

describe("routing: a team is its permission's holders", () => {
	it("one job per person, addressed to the person and never to a topic", async () => {
		const n = build();
		const out = await n.notify("psizone", "request.new", SAMPLES["request.new"], [
			{ audience: "team" },
		]);
		expect(out).toEqual({ status: "queued", jobs: 3 });
		await n.drain();
		expect(to().sort()).toEqual(["sub-ana", "sub-bia", "sub-cora"]);
		expect(resolverCalls).toEqual([{ needs: "web_requests_view", except: undefined }]);
		expect(JSON.stringify(triggers().map((t) => t.body))).not.toContain("topicKey");
	});
	it("leaves out the person who did it", async () => {
		const n = build();
		await n.notify("psizone", "appointment.cancelled", SAMPLES["appointment.cancelled"], [
			{ audience: "reception", except: "sub-bia" },
		]);
		await n.drain();
		expect(to().sort()).toEqual(["sub-ana", "sub-cora"]);
		expect(resolverCalls[0]).toEqual({ needs: "appointments_view", except: "sub-bia" });
	});
	it("an already-named person is not resolved again", async () => {
		const n = build();
		await n.notify("psizone", "request.new", SAMPLES["request.new"], [
			{ audience: "team", subject: "sub-ana" },
		]);
		await n.drain();
		expect(to()).toEqual(["sub-ana"]);
		expect(resolverCalls).toEqual([]);
	});
	it("nobody holds the permission: nothing is queued and Novu is not called", async () => {
		const empty = createNotifier({
			novu: { apiUrl: novu.url, secretKey: "sk" },
			apps: {
				psizone: {
					settings: APP_DEFAULTS.psizone,
					siteUrl: "https://p.test",
					consoleUrl: "https://c.test",
				},
			},
			outbox,
			team: () => Promise.resolve([]),
			now: () => clock.now,
			log: () => undefined,
		});
		expect(
			await empty.notify("psizone", "request.new", SAMPLES["request.new"], [{ audience: "team" }]),
		).toEqual({
			status: "off",
			reason: "no-recipient",
		});
		expect(await outbox.size()).toBe(0);
		expect(novu.requests).toHaveLength(0);
	});
});

describe("routing: preferences", () => {
	it("each person gets what they chose, and the others are unaffected", async () => {
		chosen.set("sub-bia", {
			channels: { requests: { email: false, push: false } },
			quietHours: null,
		});
		const n = build();
		await n.notify("psizone", "request.new", SAMPLES["request.new"], [{ audience: "team" }]);
		await n.drain();
		const byPerson = new Map(to().map((s, i) => [s, channelsOf(i)]));
		expect(byPerson.get("sub-ana")).toEqual({ in_app: true, push: true, email: true });
		expect(byPerson.get("sub-bia")).toEqual({ in_app: true, push: false, email: false });
		expect(asked.sort()).toEqual(["sub-ana", "sub-bia", "sub-cora"]);
	});
	it("a person who switched everything off is skipped: nothing queued for them, a suppressed step recorded", async () => {
		chosen.set("sub-ana", {
			channels: { requests: { in_app: false, push: false, email: false } },
			quietHours: null,
		});
		const n = build();
		const out = await n.notify("psizone", "request.new", SAMPLES["request.new"], [
			{ audience: "team", subject: "sub-ana" },
		]);
		expect(out).toEqual({ status: "off", reason: "no-channel" });
		expect(await outbox.size()).toBe(0);
		expect(steps.map((s) => [s.status, s.why])).toEqual([["suppressed", "preference"]]);
	});
	it("the person's own quiet hours hold their push back, not the bell", async () => {
		chosen.set("sub-ana", {
			channels: {},
			quietHours: { start: "09:00", end: "17:00", timeZone: "Europe/Bucharest" },
		});
		const n = build();
		await n.notify("psizone", "appointment.moved", SAMPLES["appointment.moved"], [
			{ audience: "practitioner", subject: "sub-ana" },
		]);
		await n.drain();
		expect(channelsOf(0)).toEqual({ in_app: true, push: false, email: false });
		expect(steps[0]?.suppressed).toEqual({ push: "quiet-hours" });
	});
	it("a chosen language reaches Novu as the subscriber's locale", async () => {
		chosen.set("sub-ana", { channels: {}, quietHours: null, locale: "en" });
		const n = build();
		await n.notify("psizone", "appointment.moved", SAMPLES["appointment.moved"], [
			{ audience: "practitioner", subject: "sub-ana", locale: "ro" },
		]);
		await n.drain();
		expect((triggers()[0]?.body as { to: { locale: string } }).to.locale).toBe("en");
	});
	it("a client's choice is looked up by their record, and an invitation's e-mail survives it", async () => {
		chosen.set("client:cli_1", { channels: { account: { email: false } }, quietHours: null });
		const n = build();
		await n.notify("psizone", "account.invite", SAMPLES["account.invite"], [client]);
		await n.drain();
		expect(channelsOf(0).email).toBe(true);
		expect(asked).toEqual(["client:cli_1"]);
	});
	it("a client with no address gets no e-mail and the step says why", async () => {
		const n = build();
		const { email: _email, ...noAddress } = client as Extract<Recipient, { audience: "client" }>;
		const out = await n.notify("psizone", "account.invite", SAMPLES["account.invite"], [noAddress]);
		expect(out.status).toBe("off");
		expect(steps.map((s) => [s.status, s.why])).toEqual([["suppressed", "no-address"]]);
		expect(await outbox.size()).toBe(0);
	});
	it("preferences that cannot be read mean the defaults, and the notification still goes", async () => {
		const n = build({ prefs: { resolve: () => Promise.reject(new Error("store down")) } });
		expect(
			await n.notify("psizone", "request.new", SAMPLES["request.new"], [{ audience: "team" }]),
		).toEqual({
			status: "queued",
			jobs: 3,
		});
	});
	it("quiet hours of the app still hold the push at night for someone who chose nothing", async () => {
		clock.now = NIGHT;
		const n = build();
		await n.notify("psizone", "appointment.moved", SAMPLES["appointment.moved"], [
			{ audience: "practitioner", subject: "sub-ana" },
		]);
		await n.drain();
		expect(channelsOf(0)).toEqual({ in_app: true, push: false, email: false });
	});
});

describe("routing: idempotency", () => {
	it("the same event for the same person is queued once", async () => {
		const n = build();
		const a = await n.notify(
			"psizone",
			"request.new",
			SAMPLES["request.new"],
			[{ audience: "team" }],
			"occ-1",
		);
		const b = await n.notify(
			"psizone",
			"request.new",
			SAMPLES["request.new"],
			[{ audience: "team" }],
			"occ-1",
		);
		expect(a).toEqual(b);
		expect(await n.pending()).toBe(3);
		await n.drain();
		expect(triggers()).toHaveLength(3);
	});
	it("two objects of one event never collapse into one delivery: every payload names its object", async () => {
		const n = build();
		const one = { ...SAMPLES["digest.reception_daily"], digestId: "reception_daily:2026-12-01" };
		const two = { ...SAMPLES["digest.reception_daily"], digestId: "reception_daily:2026-12-02" };
		await n.notify("psizone", "digest.reception_daily", one, [
			{ audience: "reception", subject: "sub-ana" },
		]);
		await n.notify("psizone", "digest.reception_daily", two, [
			{ audience: "reception", subject: "sub-ana" },
		]);
		expect(await n.pending()).toBe(2);
		const invites = [
			{ ...SAMPLES["account.invite"], clientId: "cli_1" },
			{ ...SAMPLES["account.invite"], clientId: "cli_2" },
		];
		for (const p of invites)
			await n.notify("psizone", "account.invite", p, [{ ...client, clientId: String(p.clientId) }]);
		expect(await n.pending()).toBe(4);
	});
	it("a new occurrence of the same thing is a new delivery", async () => {
		const n = build();
		const r: Recipient = { audience: "reception", subject: "sub-ana" };
		await n.notify("psizone", "reminder.confirmed", SAMPLES["reminder.confirmed"], [r], "a");
		await n.notify("psizone", "reminder.confirmed", SAMPLES["reminder.confirmed"], [r], "b");
		expect(await n.pending()).toBe(2);
	});
});

describe("routing: the delivery log", () => {
	it("follows a notification from queued to sent, with the same key and no address in it", async () => {
		const n = build();
		await n.notify("psizone", "account.invite", SAMPLES["account.invite"], [client]);
		await n.drain();
		expect(steps.map((s) => s.status)).toEqual(["queued", "sent"]);
		expect(new Set(steps.map((s) => s.key)).size).toBe(1);
		expect(JSON.stringify(steps)).not.toContain("example.test");
		expect(steps[0]).toMatchObject({ event: "account.invite", audience: "client", attempts: 0 });
		expect(steps[1]?.attempts).toBe(1);
	});
	it("records a retry, then the give-up with Novu's status", async () => {
		novu.script = (req) => (req.path === "/v1/events/trigger" ? { status: 503 } : undefined);
		const n = build();
		await n.notify("psizone", "account.invite", SAMPLES["account.invite"], [client]);
		await n.drain();
		clock.now += 60_000;
		await n.drain();
		expect(steps.map((s) => s.status)).toEqual(["queued", "retrying", "given_up"]);
		expect(steps[2]).toMatchObject({ httpStatus: 503, attempts: 2 });
		expect(await outbox.size()).toBe(0);
	});
	it("a log that is down never blocks, drops or duplicates a notification", async () => {
		const n = build({ failSink: true });
		expect(
			await n.notify("psizone", "account.invite", SAMPLES["account.invite"], [client]),
		).toEqual({
			status: "queued",
			jobs: 1,
		});
		expect(await n.drain()).toBe(1);
		expect(triggers()).toHaveLength(1);
	});
});

describe("no clinical content", () => {
	const SENTINELS = ["SENTINEL_DIAGNOSIS", "SENTINEL_NOTE", "SENTINEL_REASON", "SENTINEL_FILE"];
	const meta = (event: (typeof EVENT_IDS)[number], audience: Meta["audience"]): Meta => ({
		event,
		audience,
		channels: { in_app: true, push: true, email: true },
		brandName: "Psizone",
		theme: "psizone-light",
		timeZone: "Europe/Bucharest",
		siteUrl: "https://psizone.example",
		consoleUrl: "https://clinic.example",
		place: { name: "Psizone", address: "Str. Test 1", mapUrl: "https://maps.example/x" },
	});

	it("a payload field that is not in the allow-list never reaches Novu, for any event", async () => {
		const n = build();
		for (const entry of CATALOGUE) {
			const recipient: Recipient =
				entry.audience === "client" ? client : { audience: entry.audience, subject: "sub-ana" };
			await n.notify(
				"psizone",
				entry.event,
				{
					...SAMPLES[entry.event],
					diagnosis: SENTINELS[0],
					notes: SENTINELS[1],
					reason: SENTINELS[2],
					fileName: SENTINELS[3],
				},
				[recipient],
				entry.audience,
			);
		}
		await n.drain();
		expect(triggers().length).toBeGreaterThan(0);
		const wire = JSON.stringify(triggers().map((t) => t.body));
		for (const s of SENTINELS) expect(wire).not.toContain(s);
	});

	it("no entry, in either language, prints a field the payload schema does not carry", () => {
		for (const entry of CATALOGUE)
			for (const locale of ["ro", "en"] as const) {
				const parsed = PAYLOADS[entry.event].parse({
					...SAMPLES[entry.event],
					diagnosis: SENTINELS[0],
					notes: SENTINELS[1],
				});
				const r = render(entry, parsed, locale, meta(entry.event, entry.audience));
				const all = `${r.subject} ${r.body} ${r.cta} ${r.html} ${r.text}`;
				for (const s of SENTINELS) expect(all, `${entry.event}/${entry.audience}`).not.toContain(s);
			}
	});

	it("the payload schemas carry no field named for clinical content", () => {
		const BANNED =
			/diagnos|note|report|record|file|therapy|treatment|symptom|medic|clinical|questionnaire/i;
		for (const event of EVENT_IDS)
			for (const field of Object.keys(PAYLOADS[event].shape))
				expect(field, `${event}.${field}`).not.toMatch(BANNED);
	});
});
