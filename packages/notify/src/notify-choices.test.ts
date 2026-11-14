import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { APP_DEFAULTS } from "./apps";
import { type Choices, createNotifier, type Notifier, type Recipient } from "./notify";
import { createMemoryOutbox } from "./outbox";
import { type FakeNovu, startFakeNovu } from "./testing/fake-novu";
import { SAMPLES } from "./testing/samples";

const NOON = Date.parse("2026-11-20T10:00:00Z"); // 12:00 in Bucharest
const EVENING = Date.parse("2026-11-20T17:30:00Z"); // 19:30 in Bucharest: the app's quiet hours have not begun

let novu: FakeNovu;
let clock: { now: number };

function build(): Notifier {
	return createNotifier({
		novu: { apiUrl: novu.url, secretKey: "sk_test_secret" },
		apps: {
			psizone: {
				settings: APP_DEFAULTS.psizone,
				siteUrl: "https://psizone.example",
				consoleUrl: "https://clinic.example",
			},
		},
		outbox: createMemoryOutbox(),
		now: () => clock.now,
		log: () => undefined,
	});
}

type Sent = {
	to: Record<string, unknown>;
	payload: { meta: { channels: Record<string, boolean> } };
};
const sent = (): Sent[] =>
	novu.requests.filter((r) => r.path === "/v1/events/trigger").map((r) => r.body as Sent);

const practitioner = (choices?: Choices): Recipient => ({
	audience: "practitioner",
	subject: "sub-dora",
	locale: "ro",
	...(choices === undefined ? {} : { choices }),
});
const none: Choices = { off: [], quietHours: null };

beforeEach(async () => {
	novu = await startFakeNovu();
	clock = { now: NOON };
});
afterEach(async () => {
	await novu.close();
});

describe("a person's own choices", () => {
	it("no choices, or choices that switch nothing off: the catalogue's channels", async () => {
		const n = build();
		await n.notify("psizone", "appointment.confirmed", SAMPLES["appointment.confirmed"], [
			practitioner(),
		]);
		await n.notify("psizone", "appointment.moved", SAMPLES["appointment.moved"], [
			practitioner(none),
		]);
		await n.drain();
		expect(sent().map((s) => s.payload.meta.channels)).toEqual([
			{ in_app: true, push: true, email: false },
			{ in_app: true, push: true, email: false },
		]);
	});

	it("push switched off for the kind: the bell stays, nothing is pushed", async () => {
		const n = build();
		await n.notify("psizone", "appointment.confirmed", SAMPLES["appointment.confirmed"], [
			practitioner({ off: [{ kind: "appointments", channel: "push" }], quietHours: null }),
		]);
		await n.drain();
		expect(sent()[0]?.payload.meta.channels).toEqual({ in_app: true, push: false, email: false });
	});

	it("a kind switched off does not touch another kind", async () => {
		const n = build();
		await n.notify("psizone", "appointment.confirmed", SAMPLES["appointment.confirmed"], [
			practitioner({ off: [{ kind: "reminders", channel: "push" }], quietHours: null }),
		]);
		await n.drain();
		expect(sent()[0]?.payload.meta.channels.push).toBe(true);
	});

	it("the person's own quiet hours hold the push back even when the app's have not begun", async () => {
		clock.now = EVENING;
		const n = build();
		await n.notify("psizone", "appointment.confirmed", SAMPLES["appointment.confirmed"], [
			practitioner({
				off: [],
				quietHours: { start: "19:00", end: "07:00", timeZone: "Europe/Bucharest" },
			}),
		]);
		await n.drain();
		expect(sent()[0]?.payload.meta.channels).toEqual({ in_app: true, push: false, email: false });
	});

	it("outside the person's quiet hours the push goes", async () => {
		const n = build();
		await n.notify("psizone", "appointment.confirmed", SAMPLES["appointment.confirmed"], [
			practitioner({
				off: [],
				quietHours: { start: "19:00", end: "07:00", timeZone: "Europe/Bucharest" },
			}),
		]);
		await n.drain();
		expect(sent()[0]?.payload.meta.channels.push).toBe(true);
	});

	it("e-mail switched off for a client's kind keeps the push and drops the e-mail", async () => {
		const n = build();
		await n.notify("psizone", "appointment.confirmed", SAMPLES["appointment.confirmed"], [
			{
				audience: "client",
				clientId: "cli_1",
				email: "a@example.test",
				choices: { off: [{ kind: "appointments", channel: "email" }], quietHours: null },
			},
		]);
		await n.drain();
		expect(sent()[0]?.payload.meta.channels).toEqual({ in_app: false, push: true, email: false });
	});

	it("everything switched off for the only recipient: nothing is queued", async () => {
		const n = build();
		const out = await n.notify(
			"psizone",
			"appointment.confirmed",
			SAMPLES["appointment.confirmed"],
			[
				{
					audience: "client",
					clientId: "cli_1",
					email: "a@example.test",
					choices: {
						off: [
							{ kind: "appointments", channel: "email" },
							{ kind: "appointments", channel: "push" },
						],
						quietHours: null,
					},
				},
			],
		);
		expect(out).toEqual({ status: "off", reason: "no-channel" });
		expect(await n.pending()).toBe(0);
	});
});

describe("a team named with its members", () => {
	it("goes to each member by subject with their own choices, once each, instead of the topic", async () => {
		const n = build();
		const out = await n.notify("psizone", "request.new", SAMPLES["request.new"], [
			{
				audience: "team",
				members: [
					{ subject: "sub-olga" },
					{
						subject: "sub-rita",
						choices: { off: [{ kind: "requests", channel: "email" }], quietHours: null },
					},
				],
			},
		]);
		expect(out).toEqual({ status: "queued", jobs: 2 });
		await n.drain();
		const by = Object.fromEntries(sent().map((s) => [String(s.to.subscriberId), s]));
		expect(Object.keys(by).sort()).toEqual(["sub-olga", "sub-rita"]);
		expect(by["sub-olga"]?.payload.meta.channels).toEqual({
			in_app: true,
			push: true,
			email: true,
		});
		expect(by["sub-rita"]?.payload.meta.channels).toEqual({
			in_app: true,
			push: true,
			email: false,
		});
		expect(sent().some((s) => "topicKey" in s.to)).toBe(false);
	});

	it("a team with no members tells nobody; without the list it is the topic", async () => {
		const n = build();
		expect(
			await n.notify("psizone", "request.new", SAMPLES["request.new"], [
				{ audience: "team", members: [] },
			]),
		).toEqual({ status: "off", reason: "no-channel" });
		await n.notify("psizone", "request.new", SAMPLES["request.new"], [{ audience: "team" }]);
		await n.drain();
		expect(sent()[0]?.to).toMatchObject({ topicKey: "psizone:team" });
	});
});
