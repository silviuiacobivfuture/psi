import { beforeEach, describe, expect, it } from "vitest";
import type { Notification } from "./ports/notify";
import { createNovuNotify } from "./ports/novu-notify";
import { createWorld, type Populated } from "./testing/populate";
import { HOUR, LINK_SECRET, NOW } from "./testing/world";

const A = "/v1/apps/psizone";
const DAY = 24 * HOUR;
let w: Populated;
beforeEach(async () => {
	w = await createWorld();
});
const as = (who: string, method: string, path: string, body?: unknown) =>
	w.call(who, method, `${A}${path}`, body);

describe("the translators, through the real adapter", () => {
	type Call = { event: string; payload: Record<string, unknown>; to: Record<string, unknown>[] };
	let calls: Call[];
	beforeEach(() => {
		calls = [];
	});
	const adapter = (links = true) =>
		createNovuNotify({
			store: w.store,
			clock: () => w.clock.now,
			log: (e) => w.logs.push(e),
			...(links
				? { links: { publicOrigin: "https://api-programari.test", secret: LINK_SECRET } }
				: {}),
			notifier: {
				notify(_app, event, payload, to) {
					calls.push({ event, payload, to: [...to] });
					return Promise.resolve({ status: "queued", jobs: to.length });
				},
				drain: () => Promise.resolve(0),
				start: () => () => undefined,
				upsertSubscriber: () => Promise.resolve(),
				setTeam: () => Promise.resolve(),
				pending: () => Promise.resolve(0),
			},
		});
	const tell = (
		event: Notification["event"],
		payload: Notification["payload"],
		to: Notification["to"] = { kind: "team", permission: "appointments_view" },
	) =>
		adapter().notify({ app: "psizone", event, payload, to, idempotencyKey: `psizone:${event}:t` });

	it("the day-before reminder carries the two one-tap links, to the client, and only while the visit is ahead", async () => {
		await tell("reminder.day_before", { appointmentId: w.ids.a1, start: NOW + DAY });
		expect(calls).toHaveLength(1);
		expect(calls[0]?.payload.confirmUrl).toMatch(/\/v1\/public\/reminders\/.+\/confirm$/);
		expect(calls[0]?.payload.cancelUrl).toMatch(/\/v1\/public\/reminders\/.+\/cancel$/);
		expect(calls[0]?.to).toEqual([
			expect.objectContaining({ audience: "client", clientId: w.ids.c1 }),
		]);
	});
	it("without the means to sign the links there is no day-before reminder, rather than a reminder with no answer", async () => {
		await adapter(false).notify({
			app: "psizone",
			event: "reminder.day_before",
			payload: { appointmentId: w.ids.a1 },
			to: { kind: "client", clientId: w.ids.c1 },
			idempotencyKey: "k",
		});
		expect(calls).toEqual([]);
	});
	it("a cancelled visit is not reminded, and a missing one is ignored", async () => {
		await as("olga", "POST", `/appointments/${w.ids.a1}/cancel`, { reason: "synthetic" });
		await tell("reminder.day_before", { appointmentId: w.ids.a1 });
		await tell("reminder.two_hours", { appointmentId: w.ids.a1 });
		await tell("reminder.two_hours", { appointmentId: "gone-gone-gone" });
		expect(calls).toEqual([]);
	});
	it("the two-hour nudge goes to the client with the visit's facts", async () => {
		await tell("reminder.two_hours", { appointmentId: w.ids.a2 });
		expect(calls[0]).toMatchObject({
			event: "reminder.two_hours",
			payload: { appointmentId: w.ids.a2, serviceName: "Evaluare" },
		});
	});
	it("a report waiting goes to the therapist of the visit, with who and when and nothing of the client's health", async () => {
		await tell("record.todo", { appointmentId: w.ids.a1 });
		expect(calls).toHaveLength(1);
		expect(calls[0]?.to).toEqual([
			expect.objectContaining({ audience: "practitioner", subject: "dora" }),
		]);
		expect(JSON.stringify(calls[0])).not.toMatch(/diagnosis|synthetic-notes/);
	});
	it("a failed reminder goes to the desk, with its reason", async () => {
		await tell("reminder.failed", { appointmentId: w.ids.a1, reason: "gave_up" });
		expect(calls[0]).toMatchObject({
			event: "reminder.failed",
			payload: { reason: "gave_up" },
			to: [{ audience: "reception" }],
		});
	});
	it("a conflict names its kind, and on a day off no other session", async () => {
		await tell("appointment.conflict", { appointmentId: w.ids.a1, what: "roster" });
		await tell("appointment.conflict", {
			appointmentId: w.ids.a1,
			otherAppointmentId: w.ids.a2,
			what: "room",
		});
		expect(calls[0]?.payload).toMatchObject({ what: "roster", conflictId: `${w.ids.a1}+roster` });
		expect(calls[0]?.payload).not.toHaveProperty("otherAppointmentId");
		expect(calls[1]?.payload).toMatchObject({ what: "room", otherAppointmentId: w.ids.a2 });
	});
	it("the desk's list is one line per live session, and a day with none sends nothing", async () => {
		const day = new Date(NOW + DAY).toISOString().slice(0, 10);
		await tell("digest.reception_daily", { date: day });
		expect(calls[0]?.payload).toMatchObject({ date: day, total: 2 });
		const lines = calls[0]?.payload.lines as { at: string; text: string }[];
		expect(lines.map((l) => l.text)).toEqual(["Client One · Evaluare", "Client Two · Evaluare"]);
		calls = [];
		await tell("digest.reception_daily", { date: "2030-01-01" });
		expect(calls).toEqual([]);
	});
	it("a therapist's list holds only their own sessions, and none sends nothing", async () => {
		const day = new Date(NOW + DAY).toISOString().slice(0, 10);
		await tell(
			"digest.practitioner_evening",
			{ date: day, personId: w.ids.dora },
			{ kind: "person", subject: "dora" },
		);
		expect(calls[0]?.payload).toMatchObject({ total: 1 });
		expect((calls[0]?.payload.lines as { text: string }[]).map((l) => l.text)).toEqual([
			"Client One · Evaluare",
		]);
		calls = [];
		await tell("digest.practitioner_evening", { date: "2030-01-01", personId: w.ids.dora });
		expect(calls).toEqual([]);
	});
	it("the owners' numbers go out twice: with revenue to those who may read it, without it to the rest", async () => {
		await tell("digest.owner_daily", { date: new Date(NOW + DAY).toISOString().slice(0, 10) });
		expect(calls).toHaveLength(2);
		const [withMoney, plain] = calls;
		expect(withMoney?.to).toEqual([{ audience: "owners", needs: "reports_view_money" }]);
		expect(withMoney?.payload).toHaveProperty("revenue");
		expect(plain?.to).toEqual([{ audience: "owners", without: "reports_view_money" }]);
		expect(plain?.payload).not.toHaveProperty("revenue");
		expect(plain?.payload).toMatchObject({ appointments: 2, occupancyPercent: expect.any(Number) });
	});
	it("someone who changed their own day, or gave themselves a client, is not told of it", async () => {
		await tell("schedule.changed", {
			personId: w.ids.dora,
			date: "2026-12-01",
			what: "day_off",
			actor: "dora",
		});
		await tell("client.assigned", { clientId: w.ids.c1, personId: w.ids.dora, actor: "dora" });
		expect(calls).toEqual([]);
		await tell("schedule.changed", {
			personId: w.ids.dora,
			date: "2026-12-01",
			what: "day_off",
			actor: "olga",
		});
		await tell("client.assigned", { clientId: w.ids.c1, personId: w.ids.dora, actor: "olga" });
		expect(calls.map((c) => c.event)).toEqual(["schedule.changed", "client.assigned"]);
		expect(calls[0]?.payload.changedBy).toEqual(expect.any(String));
	});
	it("a malformed reference is dropped, not sent: a bad date, no person, a rating out of range is clamped", async () => {
		await tell("schedule.changed", { personId: w.ids.dora, date: "tomorrow", what: "day_off" });
		await tell("digest.reception_daily", { date: "not-a-date" });
		await tell("client.assigned", { clientId: w.ids.c1 });
		expect(calls).toEqual([]);
		await tell("feedback.negative", { feedbackId: "fb", rating: 99 });
		expect(calls[0]?.payload).toMatchObject({ rating: 5 });
	});
	it("a given-up delivery tells the owners its event and tries, never the person or the text", async () => {
		await tell("delivery.failed", {
			event: "reminder.day_before",
			attempts: 8,
			key: "psizone:x:abc",
		});
		expect(calls[0]).toMatchObject({
			event: "delivery.failed",
			payload: { failedEvent: "reminder.day_before", attempts: 8 },
			to: [{ audience: "owners" }],
		});
	});
});
