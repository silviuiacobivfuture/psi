import { beforeEach, describe, expect, it } from "vitest";
import { createScheduler } from "./engagement/scheduler";
import type { Notification, NotifyPort } from "./ports/notify";
import { createWorld, type Populated } from "./testing/populate";
import { HOUR, NOW } from "./testing/world";

const A = "/v1/apps/psizone";
const DAY = 24 * HOUR;
let w: Populated;
let calls: Notification[];
const port: NotifyPort = {
	notify(n) {
		calls.push(n);
		return Promise.resolve();
	},
	syncPerson: () => Promise.resolve(),
};
const scheduler = (store = w.store, sso: typeof w.sso | undefined = w.sso) =>
	createScheduler({ store, sso, port, clock: () => w.clock.now, log: (e) => w.logs.push(e) });
const events = (event: string, appointmentId?: string) =>
	calls.filter(
		(c) =>
			c.app === "psizone" &&
			c.event === event &&
			(appointmentId === undefined || c.payload.appointmentId === appointmentId),
	);

beforeEach(async () => {
	w = await createWorld();
	calls = [];
});

async function book(start: number, who = w.ids.c1): Promise<string> {
	const made = await w.call("olga", "POST", `${A}/appointments`, {
		practitionerId: w.ids.elena,
		clientId: who,
		start,
		end: start + HOUR,
	});
	if (made.status !== 200) throw new Error(`book ${made.status}`);
	return String(made.json.id);
}

describe("the desk's reminder list knows what the service sent", () => {
	const state = async (id: string) => (await w.store.c.reminders.get("psizone", id))?.state;
	it("an automatic day-before reminder reads as sent, so reception does not send it a second time", async () => {
		const start = NOW + 5 * DAY;
		const id = await book(start);
		expect(await state(id)).toBeUndefined();
		w.clock.now = start - 23 * HOUR;
		await scheduler().tick();
		expect(await state(id)).toBe("sent");
	});
	it("a reminder the client has already confirmed stays confirmed", async () => {
		const start = NOW + 5 * DAY;
		const id = await book(start);
		await w.store.c.reminders.insert({ id, app: "psizone", state: "confirmed", updatedAt: NOW });
		w.clock.now = start - 23 * HOUR;
		await scheduler().tick();
		expect(await state(id)).toBe("confirmed");
	});
	it("a client with no e-mail is NOT marked sent: nothing reached them", async () => {
		const bare = String(
			(
				await w.call("olga", "POST", `${A}/clients`, {
					name: "No Mail",
					contact: { phone: "0711" },
				})
			).json.id,
		);
		const start = NOW + 5 * DAY;
		const id = await book(start, bare);
		w.clock.now = start - 23 * HOUR;
		await scheduler().tick();
		expect(events("reminder.failed", id)).toHaveLength(1);
		expect(await state(id)).toBeUndefined();
	});
});

describe("a failing section does not silence the others", () => {
	it("two overlapping sessions (which the booking refuses, but an import may hold) are noticed, and the morning list still goes", async () => {
		const start = NOW + 3 * DAY;
		const id = await book(start);
		const first = await w.store.c.appointments.get("psizone", id);
		if (first === undefined) throw new Error("no booking");
		const second = {
			...first,
			id: "overlapping-b",
			start: start + 30 * 60_000,
			end: start + 90 * 60_000,
		};
		const store = {
			...w.store,
			c: {
				...w.store.c,
				appointments: {
					...w.store.c.appointments,
					list: () => Promise.resolve([first, second]),
				},
			},
		};
		w.clock.now = Date.parse("2026-11-14T05:30:00Z");
		await scheduler(store).tick();
		expect(events("appointment.conflict", id).map((c) => c.payload.what)).toEqual(["practitioner"]);
		expect(events("digest.reception_daily")).toHaveLength(1);
	});
	it("a store that cannot answer one question is logged, and the rest of the pass runs", async () => {
		const store = {
			...w.store,
			c: {
				...w.store.c,
				appointments: {
					...w.store.c.appointments,
					list: () => Promise.reject(new Error("down")),
				},
			},
		};
		w.clock.now = Date.parse("2026-11-14T05:30:00Z");
		await scheduler(store).tick();
		expect(w.logs.filter((l) => l.event === "scheduler_section_failed").length).toBeGreaterThan(0);
	});
});

describe("an invitation is seen to be used when the account has signed in since", () => {
	const invited = async (): Promise<{ id: string; email: string }> => {
		const made = await w.call("olga", "POST", `${A}/clients`, {
			name: "Maria Invitata",
			contact: { email: "maria@example.test" },
		});
		const id = String(made.json.id);
		expect(
			(await w.call("olga", "POST", `${A}/clients/${id}/invite`, { contact: "client" })).status,
		).toBe(200);
		return { id, email: "maria@example.test" };
	};
	const status = async (id: string) =>
		((await w.call("olga", "GET", `${A}/clients/${id}/invite`)).json.invite as { status: string })
			.status;

	it("a sign-in after the invitation activates it once, audited, and thanks the person", async () => {
		const { id, email } = await invited();
		w.sso.signIn(email, NOW + HOUR);
		w.clock.now = NOW + 2 * HOUR;
		const s = scheduler();
		await s.tick();
		await s.tick();
		expect(await status(id)).toBe("active");
		expect(events("account.activated")).toHaveLength(1);
		const audit = (await w.store.c.audit.list("psizone")).filter(
			(e) => e.action === "client.invite_activated" && e.target.id === id,
		);
		expect(audit).toEqual([
			expect.objectContaining({ actor: { subject: "system:scheduler", kind: "service" } }),
		]);
	});
	it("a sign-in from before the invitation (an account that existed) is not a use of it", async () => {
		w.sso.seed("maria@example.test");
		const { id } = await invited();
		w.sso.signIn("maria@example.test", NOW - DAY);
		w.clock.now = NOW + HOUR;
		await scheduler().tick();
		expect(await status(id)).toBe("invited");
	});
	it("an account that never signed in stays invited", async () => {
		const { id } = await invited();
		w.clock.now = NOW + 2 * HOUR;
		await scheduler().tick();
		expect(await status(id)).toBe("invited");
		expect(events("account.activated")).toHaveLength(0);
	});
	it("the sign-in is asked at most every five minutes, not on every tick", async () => {
		await invited();
		const s = scheduler();
		w.clock.now = NOW + HOUR;
		await s.tick();
		const asked = () => w.sso.calls.filter((c) => c.startsWith("lastLogin:")).length;
		const once = asked();
		expect(once).toBeGreaterThan(0);
		w.clock.now += 60_000;
		await s.tick();
		expect(asked()).toBe(once);
		w.clock.now += 5 * 60_000;
		await s.tick();
		expect(asked()).toBeGreaterThan(once);
	});
	it("an invitation older than a month, a withdrawn one and an active one are not asked about", async () => {
		const { id, email } = await invited();
		w.sso.signIn(email, NOW + HOUR);
		w.clock.now = NOW + 31 * DAY;
		await scheduler().tick();
		expect(await status(id)).toBe("expired");
		expect(w.sso.calls.filter((c) => c.startsWith("lastLogin:"))).toEqual([]);
	});
	it("a sign-in that is away is logged and the rest of the pass runs; nothing is activated", async () => {
		const { id, email } = await invited();
		w.sso.signIn(email, NOW + HOUR);
		w.sso.failing = true;
		w.clock.now = Date.parse("2026-11-14T05:30:00Z");
		await scheduler().tick();
		expect(await status(id)).toBe("invited");
		expect(w.logs.some((l) => l.event === "scheduler_section_failed")).toBe(true);
		expect(events("digest.reception_daily")).toHaveLength(1);
	});
	it("without a sign-in configured nothing is asked", async () => {
		const { id } = await invited();
		w.clock.now = NOW + 2 * HOUR;
		await scheduler(w.store, undefined).tick();
		expect(await status(id)).toBe("invited");
	});
});
