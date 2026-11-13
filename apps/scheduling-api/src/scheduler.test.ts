import { beforeEach, describe, expect, it } from "vitest";
import { createScheduler, SCHEDULE } from "./engagement/scheduler";
import type { Notification, NotifyPort } from "./ports/notify";
import { createWorld, type Populated } from "./testing/populate";
import { HOUR, NOW } from "./testing/world";

const A = "/v1/apps/psizone";
const DAY = 24 * HOUR;
let w: Populated;
let calls: Notification[];
let failing: boolean;

/** A port that records EVERY call: what the scheduler sends twice would show twice (no dedupe on its side). */
const port: NotifyPort = {
	notify(n) {
		if (failing) return Promise.reject(new Error("down"));
		calls.push(n);
		return Promise.resolve();
	},
	syncPerson: () => Promise.resolve(),
};
const scheduler = () =>
	createScheduler({ store: w.store, port, clock: () => w.clock.now, log: (e) => w.logs.push(e) });
/** What was queued for the clinic (the other app is a second, separate world), optionally about one appointment. */
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
	failing = false;
});

/** Books a session as the desk would, at the clock's current time (so `createdAt` is "now"). */
async function book(
	start: number,
	over: Record<string, unknown> = {},
	who: string | undefined = w.ids.c1,
): Promise<string> {
	const made = await w.call("olga", "POST", `${A}/appointments`, {
		practitionerId: w.ids.elena,
		...(who === undefined ? {} : { clientId: who }),
		start,
		end: start + HOUR,
		...over,
	});
	if (made.status !== 200) throw new Error(`book ${made.status} ${JSON.stringify(made.json)}`);
	return String(made.json.id);
}
const at = (iso: string): number => Date.parse(iso);

describe("reminders", () => {
	it("a session booked days ahead is reminded once, a day before, and not again on the next tick", async () => {
		const start = NOW + 5 * DAY;
		const id = await book(start);
		const s = scheduler();
		w.clock.now = start - 25 * HOUR;
		await s.tick();
		expect(events("reminder.day_before", id)).toHaveLength(0);
		w.clock.now = start - 24 * HOUR + 1000;
		await s.tick();
		await s.tick();
		w.clock.now = start - 10 * HOUR;
		await s.tick();
		expect(events("reminder.day_before", id)).toEqual([
			expect.objectContaining({
				app: "psizone",
				payload: { appointmentId: id, start },
				to: { kind: "client", clientId: w.ids.c1 },
			}),
		]);
	});
	it("two hours before, a nudge, once", async () => {
		const start = NOW + 5 * DAY;
		const id = await book(start);
		const s = scheduler();
		w.clock.now = start - 3 * HOUR;
		await s.tick();
		expect(events("reminder.two_hours", id)).toHaveLength(0);
		w.clock.now = start - 2 * HOUR + 1000;
		await s.tick();
		await s.tick();
		expect(events("reminder.two_hours", id)).toHaveLength(1);
	});
	it("a session booked the day before is its own notice: no day-before reminder follows the confirmation, the nudge still comes", async () => {
		const start = NOW + 20 * HOUR;
		const id = await book(start);
		const s = scheduler();
		for (const t of [NOW, start - 5 * HOUR, start - 1.5 * HOUR]) {
			w.clock.now = t;
			await s.tick();
		}
		expect(events("reminder.day_before", id)).toHaveLength(0);
		expect(events("reminder.two_hours", id)).toHaveLength(1);
	});
	it("a session booked less than three hours ahead gets neither", async () => {
		const start = NOW + 2 * HOUR;
		const id = await book(start);
		const s = scheduler();
		w.clock.now = start - HOUR;
		await s.tick();
		expect(events("reminder.day_before", id)).toHaveLength(0);
		expect(events("reminder.two_hours", id)).toHaveLength(0);
	});
	it("a client with no e-mail is not mailed: the desk is told, once, to reach them another way", async () => {
		const bare = String(
			(
				await w.call("olga", "POST", `${A}/clients`, {
					name: "No Mail",
					contact: { phone: "0711 111 111" },
				})
			).json.id,
		);
		const start = NOW + 5 * DAY;
		const id = await book(start, {}, bare);
		w.clock.now = start - 23 * HOUR;
		const s = scheduler();
		await s.tick();
		await s.tick();
		expect(events("reminder.day_before", id)).toHaveLength(0);
		expect(events("reminder.failed", id)).toEqual([
			expect.objectContaining({ payload: { appointmentId: id, reason: "no_contact" } }),
		]);
		w.clock.now = start - HOUR;
		await s.tick();
		expect(events("reminder.two_hours", id)).toHaveLength(0);
	});
	it("a cancelled, deleted or client-less booking is not reminded", async () => {
		const start = NOW + 5 * DAY;
		const cancelled = await book(start);
		await w.call("olga", "POST", `${A}/appointments/${cancelled}/cancel`, { reason: "synthetic" });
		const deleted = await book(start + 2 * HOUR);
		await w.call("olga", "DELETE", `${A}/appointments/${deleted}`);
		const block = await book(start + 4 * HOUR, { kind: "block" }, undefined);
		w.clock.now = start - 23 * HOUR;
		await scheduler().tick();
		for (const id of [cancelled, deleted, block]) {
			expect(events("reminder.day_before", id)).toHaveLength(0);
			expect(events("reminder.failed", id)).toHaveLength(0);
		}
	});
	it("a moved session is reminded for its new time, and the old time is not", async () => {
		const start = NOW + 5 * DAY;
		const id = await book(start);
		const s = scheduler();
		w.clock.now = start - 23 * HOUR;
		await s.tick();
		const moved = start + 2 * DAY;
		const patch = await w.call("olga", "PATCH", `${A}/appointments/${id}`, {
			start: moved,
			end: moved + HOUR,
		});
		expect(patch.status).toBe(200);
		w.clock.now = moved - 23 * HOUR;
		await s.tick();
		expect(events("reminder.day_before", id).map((c) => c.payload.start)).toEqual([start, moved]);
	});
});

describe("after a session", () => {
	/** A session that began `agoHours` before the clock reads (booked long before), marked as it ended. */
	async function took(agoHours: number, status: "attended" | "no_show", who = w.ids.c1) {
		w.clock.now = NOW - 5 * DAY;
		const id = await book(NOW - agoHours * HOUR, {}, who);
		w.clock.now = NOW;
		const marked = await w.call("olga", "POST", `${A}/appointments/${id}/attendance`, { status });
		expect(marked.status).toBe(200);
		return id;
	}
	it("asks how it went once the client has left, only for a session that took place", async () => {
		const attended = await took(4, "attended");
		const missed = await took(5, "no_show", w.ids.c2);
		const s = scheduler();
		await s.tick();
		await s.tick();
		expect(events("feedback.requested", attended)).toEqual([
			expect.objectContaining({ payload: { appointmentId: attended } }),
		]);
		expect(events("feedback.requested", missed)).toHaveLength(0);
	});
	it("not before two hours have passed since it ended", async () => {
		const id = await took(1.5, "attended");
		await scheduler().tick();
		expect(events("feedback.requested", id)).toHaveLength(0);
	});
	it("tells the desk a report is waiting, and only once", async () => {
		const id = await took(3, "attended");
		const s = scheduler();
		await s.tick();
		await s.tick();
		expect(events("record.todo", id)).toHaveLength(1);
	});
	it("asks nothing for a session whose report exists", async () => {
		const id = await took(3, "attended");
		const made = await w.call("olga", "POST", `${A}/clients/${w.ids.c1}/records`, {
			formId: w.ids.form,
			appointmentId: id,
			data: { note: "synthetic" },
		});
		expect(made.status).toBe(200);
		await scheduler().tick();
		expect(events("record.todo", id)).toHaveLength(0);
	});
});

describe("conflicts", () => {
	it("back to back is not a conflict, and nothing is queued for it", async () => {
		const start = NOW + 3 * DAY;
		const a = await book(start);
		const b = await book(start + HOUR, {}, w.ids.c2);
		await scheduler().tick();
		expect(events("appointment.conflict", a)).toHaveLength(0);
		expect(events("appointment.conflict", b)).toHaveLength(0);
	});
	it("the service refuses a double booking, so a conflict only exists when one got in some other way", async () => {
		const start = NOW + 3 * DAY;
		await book(start, { roomId: w.ids.room });
		const clash = await w.call("olga", "POST", `${A}/appointments`, {
			practitionerId: w.ids.dora,
			clientId: w.ids.c2,
			roomId: w.ids.room,
			start: start + 30 * 60_000,
			end: start + 90 * 60_000,
		});
		expect(clash.status).toBe(409);
	});
	it("a booked session on a day the therapist then takes off is one notice to the desk, however many ticks", async () => {
		const start = NOW + 3 * DAY;
		const id = await book(start);
		const day = new Date(start).toISOString().slice(0, 10);
		const off = await w.call("olga", "PUT", `${A}/roster/${w.ids.elena}/${day}`, { kind: "free" });
		expect(off.status).toBe(200);
		const s = scheduler();
		await s.tick();
		await s.tick();
		expect(events("appointment.conflict", id)).toEqual([
			expect.objectContaining({ payload: { appointmentId: id, what: "roster" } }),
		]);
	});
	it("hours that still hold the session are no conflict, and hours that no longer do are", async () => {
		const start = NOW + 3 * DAY;
		const id = await book(start);
		const day = new Date(start).toISOString().slice(0, 10);
		await w.call("olga", "PUT", `${A}/roster/${w.ids.elena}/${day}`, {
			kind: "work",
			start: 0,
			end: 1440,
		});
		const s = scheduler();
		await s.tick();
		expect(events("appointment.conflict", id)).toHaveLength(0);
		await w.call("olga", "PUT", `${A}/roster/${w.ids.elena}/${day}`, {
			kind: "work",
			start: 18 * 60,
			end: 20 * 60,
		});
		await s.tick();
		expect(events("appointment.conflict", id)).toHaveLength(1);
	});
	it("a day nobody said anything about is not a conflict", async () => {
		const id = await book(NOW + 3 * DAY);
		await scheduler().tick();
		expect(events("appointment.conflict", id)).toHaveLength(0);
	});
});

describe("the daily summaries, in the clinic's own clock", () => {
	const reception = () => events("digest.reception_daily");
	it("goes out at 07:30, once, and catches up inside its window", async () => {
		const s = scheduler();
		w.clock.now = at("2026-12-01T05:29:00Z");
		await s.tick();
		expect(reception()).toHaveLength(0);
		w.clock.now = at("2026-12-01T05:30:00Z");
		await s.tick();
		await s.tick();
		w.clock.now = at("2026-12-01T06:00:00Z");
		await s.tick();
		expect(reception()).toHaveLength(1);
		expect(reception()[0]?.payload).toEqual({ date: "2026-12-01" });
	});
	it("a service that was away until 10:30 still sends it; one that returns at 11:00 does not", async () => {
		const s = scheduler();
		w.clock.now = at("2026-12-02T08:30:00Z");
		await s.tick();
		expect(reception()).toHaveLength(1);
		w.clock.now = at("2026-12-03T09:00:00Z");
		await s.tick();
		expect(reception()).toHaveLength(1);
	});
	it.each([
		["a winter day (UTC+2)", "2026-12-01T05:30:00Z"],
		["a summer day (UTC+3)", "2026-07-01T04:30:00Z"],
		["the day the clocks go forward (UTC+3 by morning)", "2026-03-29T04:30:00Z"],
		["the day the clocks go back (UTC+2 by morning)", "2026-10-25T05:30:00Z"],
	])("%s: 07:30 is what the clinic's clocks say, not a fixed hour of UTC", async (_what, onTime) => {
		const s = scheduler();
		w.clock.now = at(onTime) - 60_000;
		await s.tick();
		expect(reception()).toHaveLength(0);
		w.clock.now = at(onTime);
		await s.tick();
		expect(reception()).toHaveLength(1);
	});
	it("a therapist's evening list names tomorrow and goes to that therapist only", async () => {
		const s = scheduler();
		w.clock.now = at("2026-12-01T17:00:00Z");
		await s.tick();
		const mine = events("digest.practitioner_evening");
		expect(mine.map((c) => c.to)).toEqual(
			expect.arrayContaining([
				{ kind: "person", subject: "dora" },
				{ kind: "person", subject: "elena" },
			]),
		);
		expect(new Set(mine.map((c) => c.payload.date))).toEqual(new Set(["2026-12-02"]));
		await s.tick();
		expect(events("digest.practitioner_evening")).toHaveLength(mine.length);
	});
	it("the owners' day closes at 20:00, and their week on Monday morning with the week before", async () => {
		const s = scheduler();
		w.clock.now = at("2026-12-01T18:00:00Z");
		await s.tick();
		expect(events("digest.owner_daily").map((c) => c.payload)).toEqual([{ date: "2026-12-01" }]);
		w.clock.now = at("2026-12-07T06:00:00Z");
		await s.tick();
		expect(events("digest.owner_weekly").map((c) => c.payload)).toEqual([
			{ from: "2026-11-30", to: "2026-12-06" },
		]);
		w.clock.now = at("2026-12-08T06:00:00Z");
		await s.tick();
		expect(events("digest.owner_weekly")).toHaveLength(1);
	});
	it("the windows are the ones named", () => {
		expect(SCHEDULE.receptionDaily.from).toBe("07:30");
		expect(SCHEDULE.ownerWeekly.day).toBe("Mon");
	});
});

describe("at most once, and retried when it failed", () => {
	it("three ticks at once queue each thing once", async () => {
		const start = NOW + 5 * DAY;
		const id = await book(start);
		w.clock.now = start - 23 * HOUR;
		await Promise.all([scheduler().tick(), scheduler().tick(), scheduler().tick()]);
		expect(events("reminder.day_before", id)).toHaveLength(1);
	});
	it("a port that is down hands the claim back, and the next tick tries again", async () => {
		const start = NOW + 5 * DAY;
		const id = await book(start);
		w.clock.now = start - 23 * HOUR;
		const s = scheduler();
		failing = true;
		await s.tick();
		expect(w.logs.some((l) => l.event === "scheduled_notice_failed")).toBe(true);
		expect(events("reminder.day_before", id)).toHaveLength(0);
		failing = false;
		await s.tick();
		expect(events("reminder.day_before", id)).toHaveLength(1);
	});
	it("a suspended app is left alone", async () => {
		const start = NOW + 5 * DAY;
		await book(start);
		const suspended = await w.call("root", "PATCH", `/v1/apps/psizone`, { status: "suspended" });
		expect(suspended.status).toBe(200);
		w.clock.now = start - 23 * HOUR;
		await scheduler().tick();
		expect(calls.filter((c) => c.app === "psizone")).toEqual([]);
	});
	it("claims of days long past are dropped, those of the day kept", async () => {
		const s = scheduler();
		w.clock.now = at("2026-12-01T05:30:00Z");
		await s.tick();
		expect((await w.store.keyed.list("psizone", "tick")).length).toBeGreaterThan(0);
		w.clock.now = at("2026-12-20T12:00:00Z");
		await s.tick();
		const keys = (await w.store.keyed.list("psizone", "tick")).map((e) => e.key);
		expect(keys.some((k) => k.startsWith("2026-12-01/"))).toBe(false);
	});
});
