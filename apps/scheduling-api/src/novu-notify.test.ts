import { beforeEach, describe, expect, it } from "vitest";
import { wireNotify } from "./notify-wiring";
import { createNovuNotify } from "./ports/novu-notify";
import { createWorld, type Populated } from "./testing/populate";
import { HOUR, LINK_SECRET, NOW, testConfig } from "./testing/world";

type Call = {
	app: string;
	event: string;
	payload: Record<string, unknown>;
	to: Record<string, unknown>[];
	occurrence?: string | undefined;
};
let w: Populated;
let calls: Call[];
let directory: { app: string; subject: string; add: string[]; remove: string[] }[];

beforeEach(async () => {
	w = await createWorld();
	calls = [];
	directory = [];
});

function adapter(links = true) {
	return createNovuNotify({
		store: w.store,
		clock: () => NOW,
		log: (e) => w.logs.push(e),
		...(links
			? { links: { publicOrigin: "https://api-programari.test", secret: LINK_SECRET } }
			: {}),
		notifier: {
			notify(app, event, payload, to, occurrence) {
				calls.push({ app, event, payload, to: [...to], occurrence });
				return Promise.resolve({ status: "queued", jobs: to.length });
			},
			drain: () => Promise.resolve(0),
			start: () => () => undefined,
			upsertSubscriber: (app, r) => {
				directory.push({ app, subject: "subject" in r ? r.subject : "", add: [], remove: [] });
				return Promise.resolve();
			},
			setTeam: (app, team, add, remove) => {
				directory.push({ app, subject: team, add: [...add], remove: [...remove] });
				return Promise.resolve();
			},
			pending: () => Promise.resolve(0),
		},
	});
}

describe("the catalogue's events, from what the handlers say happened", () => {
	it("a staff booking tells the client and the practitioner, with the facts and a calendar link", async () => {
		await adapter().notify({
			app: "psizone",
			event: "appointment.confirmed",
			payload: { appointmentId: w.ids.a1, start: NOW + 24 * HOUR },
			to: { kind: "client", clientId: w.ids.c1 },
			idempotencyKey: "psizone:appointment.confirmed:k1",
		});
		expect(calls).toHaveLength(1);
		const [call] = calls;
		expect(call).toMatchObject({
			app: "psizone",
			event: "appointment.confirmed",
			occurrence: "psizone:appointment.confirmed:k1",
			payload: {
				appointmentId: w.ids.a1,
				clientName: "Client One",
				serviceName: "Evaluare",
				practitionerName: "Dora Test",
				startsAt: new Date(NOW + 24 * HOUR).toISOString(),
			},
		});
		expect(String(call?.payload.icsUrl)).toMatch(
			/^https:\/\/api-programari\.test\/v1\/public\/reminders\/.+\/ics$/,
		);
		expect(call?.to).toEqual([
			expect.objectContaining({
				audience: "client",
				clientId: w.ids.c1,
				email: "one@example.test",
			}),
			expect.objectContaining({ audience: "practitioner", subject: "dora" }),
		]);
	});

	it("without the link secret there is no calendar link, and nothing else changes", async () => {
		await adapter(false).notify({
			app: "psizone",
			event: "appointment.cancelled",
			payload: { appointmentId: w.ids.a1, start: NOW },
			to: { kind: "client", clientId: w.ids.c1 },
			idempotencyKey: "k",
		});
		expect(calls[0]?.payload).not.toHaveProperty("icsUrl");
	});

	it("a moved appointment says when it was", async () => {
		await adapter().notify({
			app: "psizone",
			event: "appointment.moved",
			payload: { appointmentId: w.ids.a1, start: NOW + 30 * HOUR, previousStart: NOW + 24 * HOUR },
			to: { kind: "client", clientId: w.ids.c1 },
			idempotencyKey: "k",
		});
		expect(calls[0]?.payload.previousStartsAt).toBe(new Date(NOW + 24 * HOUR).toISOString());
	});

	it("a callback tells the team; a package running low tells reception; a payment tells the client", async () => {
		const sent = adapter();
		await sent.notify({
			app: "psizone",
			event: "package.low",
			payload: { packageId: w.ids.pkg, sessionsRemaining: 1 },
			to: { kind: "team", permission: "packages_view" },
			idempotencyKey: "k1",
		});
		await sent.notify({
			app: "psizone",
			event: "payment.recorded",
			payload: {
				paymentId: w.ids.payment,
				clientId: w.ids.c1,
				amountCents: 25000,
				what: "10 sessions",
			},
			to: { kind: "team", permission: "payments_view" },
			idempotencyKey: "k2",
		});
		expect(calls.map((c) => [c.event, c.to.map((r) => r.audience)])).toEqual([
			["package.running_low", ["reception"]],
			["payment.recorded", ["client"]],
		]);
		expect(calls[0]?.payload).toMatchObject({ clientName: "Client One", remaining: 1 });
		expect(calls[1]?.payload).toMatchObject({ amount: "250.00 RON", serviceName: "10 sessions" });
	});

	it("leave goes to the owners, and its decision to the person who asked", async () => {
		const sent = adapter();
		await sent.notify({
			app: "psizone",
			event: "leave.requested",
			payload: { leaveId: w.ids.leave, personId: w.ids.dora, from: "2026-12-01", to: "2026-12-03" },
			to: { kind: "team", permission: "leave_approve" },
			idempotencyKey: "k1",
		});
		await sent.notify({
			app: "psizone",
			event: "leave.decided",
			payload: { leaveId: w.ids.leave, decision: "approved" },
			to: { kind: "person", subject: "dora" },
			idempotencyKey: "k2",
		});
		expect(calls.map((c) => [c.event, c.to.map((r) => r.audience)])).toEqual([
			["leave.requested", ["owners"]],
			["leave.approved", ["requester"]],
		]);
		expect(calls[0]?.payload).toMatchObject({ personName: "Dora Test" });
	});

	it("a no-show has no message in the catalogue: nothing is sent", async () => {
		await adapter().notify({
			app: "psizone",
			event: "attendance.no_show",
			payload: { appointmentId: w.ids.a1 },
			to: { kind: "team", permission: "appointments_edit" },
			idempotencyKey: "k",
		});
		expect(calls).toEqual([]);
	});

	it("an app the notifier does not know, or a row that is gone, sends nothing and is logged or ignored", async () => {
		await adapter().notify({
			app: "elsewhere",
			event: "appointment.confirmed",
			payload: { appointmentId: w.ids.a1 },
			to: { kind: "client", clientId: w.ids.c1 },
			idempotencyKey: "k",
		});
		await adapter().notify({
			app: "psizone",
			event: "appointment.confirmed",
			payload: { appointmentId: "gone-gone-gone" },
			to: { kind: "client", clientId: w.ids.c1 },
			idempotencyKey: "k2",
		});
		expect(calls).toEqual([]);
		expect(w.logs.some((l) => l.event === "notify_unknown_app")).toBe(true);
	});

	it("a member is a subscriber and sits in the teams their roles name", async () => {
		await adapter().syncPerson(
			"psizone",
			{ subject: "rita", name: "Rita", email: "rita@example.test" },
			{ add: ["team", "reception"], remove: ["owners"] },
		);
		expect(directory).toEqual([
			{ app: "psizone", subject: "rita", add: [], remove: [] },
			{ app: "psizone", subject: "team", add: ["rita"], remove: [] },
			{ app: "psizone", subject: "reception", add: ["rita"], remove: [] },
			{ app: "psizone", subject: "owners", add: [], remove: ["rita"] },
		]);
	});
});

describe("through the real notifier: queued, durable-shaped, delivered to Novu with the action's own key", () => {
	it("a booking reaches Novu as the client's workflow, once even if told twice", async () => {
		const sent: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
		const fetch: typeof globalThis.fetch = (input, init) => {
			const headers = new Headers(init?.headers);
			sent.push({ url: String(input), headers, body: JSON.parse(String(init?.body ?? "{}")) });
			return Promise.resolve(
				new Response(JSON.stringify({ data: { acknowledged: true, status: "processed" } }), {
					status: 201,
				}),
			);
		};
		const wiring = wireNotify({
			config: {
				...testConfig(w.issuer),
				notify: {
					novuApiUrl: "http://novu.test:3000",
					novuSecretKey: "secret-novu-key",
					reminderLinkSecret: LINK_SECRET,
				},
			},
			store: w.store,
			rpc: undefined,
			clock: () => NOW,
			log: (e) => w.logs.push(e),
			fetch,
		});
		try {
			const n = {
				app: "psizone",
				event: "appointment.confirmed" as const,
				payload: { appointmentId: w.ids.a1, start: NOW + 24 * HOUR },
				to: { kind: "client" as const, clientId: w.ids.c1 },
				idempotencyKey: "psizone:appointment.confirmed:once",
			};
			await wiring.notifier.notify(n);
			await wiring.notifier.notify(n);
			expect(await wiring.drain()).toBe(2); // client + practitioner, each once
			expect(sent.map((s) => s.body.name).sort()).toEqual([
				"psizone-appointment-confirmed-client",
				"psizone-appointment-confirmed-practitioner",
			]);
			expect(new Set(sent.map((s) => s.headers.get("idempotency-key"))).size).toBe(2);
			expect(wiring.reminders).toBeDefined();
		} finally {
			wiring.stop();
		}
	});
});
