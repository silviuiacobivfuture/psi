import { accountClientId } from "@psi/notify";
import { accountHashOf } from "@psi/scheduling";
import { beforeEach, describe, expect, it } from "vitest";
import { wireNotify } from "./notify-wiring";
import { createNovuNotify, notifyApps } from "./ports/novu-notify";
import { bookAs } from "./testing/booking";
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

describe("the console a notification's links lead to is the environment's own", () => {
	it("both brands point at the configured console, never at another environment's", () => {
		const apps = notifyApps("https://programari-dev.psizone.ro");
		expect(Object.keys(apps).sort()).toEqual(["hemisync", "psizone"]);
		for (const app of Object.values(apps)) {
			expect(app.consoleUrl).toBe("https://programari-dev.psizone.ro");
		}
		expect(JSON.stringify(apps)).not.toContain("https://programari.psizone.ro");
		expect(notifyApps("https://programari.psizone.ro").psizone?.consoleUrl).toBe(
			"https://programari.psizone.ro",
		);
	});
});

describe("the catalogue's events, from what the handlers say happened", () => {
	it("a staff booking tells the client and the practitioner, with the facts and a calendar link", async () => {
		await adapter().notify({
			app: "psizone",
			event: "appointment.confirmed",
			payload: { appointmentId: w.ids.a1, start: NOW + 24 * HOUR },
			to: { kind: "client", clientId: w.ids.c1 },
			idempotencyKey: "psizone:appointment.confirmed:k1",
		});
		// The client and the therapist first; the desk as a second message, which alone says who did it.
		expect(calls).toHaveLength(2);
		const [call, desk] = calls;
		expect(desk?.to).toEqual([{ audience: "reception" }]);
		expect(desk?.payload).not.toHaveProperty("changedBy");
		expect(call?.payload).not.toHaveProperty("changedBy");
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

	it("a visitor who moves their own request is told at their account, and the desk is told it was the client, with both times", async () => {
		const { reference } = await bookAs(w, "visitor-mover");
		const account = accountHashOf("visitor-mover");
		await adapter().notify({
			app: "psizone",
			event: "appointment.moved",
			payload: { reference, previousStart: NOW + 20 * HOUR, account },
			to: { kind: "team", permission: "web_requests_view" },
			idempotencyKey: "k-move",
		});
		expect(calls.map((c) => c.event)).toEqual(["appointment.moved", "appointment.moved"]);
		const [client, desk] = calls;
		expect(client?.to).toEqual([
			expect.objectContaining({ audience: "client", clientId: accountClientId(account) }),
		]);
		expect(desk?.to).toEqual([{ audience: "reception" }]);
		expect(desk?.payload).toMatchObject({
			appointmentId: reference,
			source: "client",
			previousStartsAt: new Date(NOW + 20 * HOUR).toISOString(),
		});
		expect(desk?.occurrence).toBe("k-move");
	});

	it("a visitor without an account who moves is told at that request alone", async () => {
		const { reference } = await bookAs(w, "visitor-anon");
		await adapter().notify({
			app: "psizone",
			event: "appointment.moved",
			payload: { reference, previousStart: NOW + 20 * HOUR },
			to: { kind: "team", permission: "web_requests_view" },
			idempotencyKey: "k-anon",
		});
		expect(calls[0]?.to).toEqual([
			expect.objectContaining({ audience: "client", clientId: reference }),
		]);
		expect(calls[1]?.to).toEqual([{ audience: "reception" }]);
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
			["package.running_low", ["reception", "client"]],
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

	it("an invited member is e-mailed at the address they were added with, with their name and no link; one who left gets nothing", async () => {
		await w.call("olga", "PUT", "/v1/apps/psizone/members/invited-one", {
			displayName: "Nou Venit",
			email: "nou.venit@example.test",
			roles: [],
			coordinates: [],
		});
		const told = (subject: string, key: string) =>
			adapter().notify({
				app: "psizone",
				event: "team.invite",
				payload: { subject, locale: "en" },
				to: { kind: "person", subject },
				idempotencyKey: key,
			});
		await told("invited-one", "k1");
		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({
			event: "team.invite",
			payload: { name: "Nou Venit" },
			to: [
				{
					audience: "invitee",
					subject: "invited-one",
					email: "nou.venit@example.test",
					name: "Nou Venit",
					locale: "en",
				},
			],
		});
		expect(Object.keys(calls[0]?.payload ?? {}).sort()).toEqual(["inviteId", "name"]);
		await told("nobody-here", "k2");
		// rita has no e-mail in the populated world: nothing can be sent to her either
		await told("rita", "k3");
		expect(calls).toHaveLength(1);
	});

	it("a member is a subscriber with their name and address, and no team topic is touched: teams are resolved when sending", async () => {
		await adapter().syncPerson("psizone", {
			subject: "rita",
			name: "Rita",
			email: "rita@example.test",
		});
		expect(directory).toEqual([{ app: "psizone", subject: "rita", add: [], remove: [] }]);
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
					consoleUrl: "https://programari.test",
				},
			},
			store: w.store,
			access: w.deps.access,
			sso: undefined,
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
			// The client, the therapist, and each member of the desk (a person each, never a topic), every one once.
			const desk: string[] = [];
			for (const m of await w.store.c.members.list("psizone"))
				if (await w.deps.access.canAll(m.subject, "psizone", "appointments_view"))
					desk.push(m.subject);
			expect(desk.length).toBeGreaterThan(1);
			expect(await wiring.drain()).toBe(2 + desk.length);
			const names = sent.map((s) => s.body.name);
			expect(names.filter((x) => x === "psizone-appointment-confirmed-client")).toHaveLength(1);
			expect(names.filter((x) => x === "psizone-appointment-confirmed-practitioner")).toHaveLength(
				1,
			);
			const reception = sent.filter(
				(s) => s.body.name === "psizone-appointment-confirmed-reception",
			);
			expect(
				reception.map((s) => (s.body.to as { subscriberId: string }).subscriberId).sort(),
			).toEqual([...desk].sort());
			expect(new Set(sent.map((s) => s.headers.get("idempotency-key"))).size).toBe(2 + desk.length);
			expect(JSON.stringify(sent.map((s) => s.body.to))).not.toContain("topicKey");
			expect(wiring.reminders).toBeDefined();
			expect(wiring.invites).toBeDefined();
		} finally {
			wiring.stop();
		}
	});
});
