import { accountHashOf } from "@psi/scheduling";
import { beforeEach, describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config";
import { createScheduler, DEFAULT_LEADS, type ReminderLeads } from "./engagement/scheduler";
import type { Notification, NotifyPort } from "./ports/notify";
import { createWorld, type Populated } from "./testing/populate";
import { HOUR } from "./testing/world";

const A = "/v1/apps/psizone";
let w: Populated;
let calls: Notification[];

/** A port that records every call: a reminder sent twice would show twice. */
const port: NotifyPort = {
	notify(n) {
		calls.push(n);
		return Promise.resolve();
	},
	syncPerson: () => Promise.resolve(),
};
const scheduler = (leads?: ReminderLeads) =>
	createScheduler({
		store: w.store,
		port,
		clock: () => w.clock.now,
		log: (e) => w.logs.push(e),
		...(leads === undefined ? {} : { leads }),
	});
const sent = (event: string, id: string) =>
	calls.filter((c) => c.app === "psizone" && c.event === event && c.payload.appointmentId === id);
const at = (iso: string): number => Date.parse(iso);

beforeEach(async () => {
	w = await createWorld();
	calls = [];
});

/** Books a session as the desk would, now (so it is booked well ahead of both reminders). */
async function book(start: number): Promise<string> {
	const made = await w.call("olga", "POST", `${A}/appointments`, {
		practitionerId: w.ids.elena,
		clientId: w.ids.c1,
		start,
		end: start + HOUR,
	});
	if (made.status !== 200) throw new Error(`book ${made.status} ${JSON.stringify(made.json)}`);
	return String(made.json.id);
}

/** Ticks at each instant in turn. */
async function tickAt(s: ReturnType<typeof scheduler>, ...instants: number[]): Promise<void> {
	for (const instant of instants) {
		w.clock.now = instant;
		await s.tick();
	}
}

describe("the reminders' leads are the instance's", () => {
	it("by default a day and two hours before", () => {
		expect(DEFAULT_LEADS).toEqual({ dayBeforeHours: 24, soonHours: 2 });
	});

	it("48 hours and 4 hours: each reminder goes at its own lead, once, and not at the default one", async () => {
		// 10:00 in Bucharest, outside every quiet hour.
		const start = at("2026-11-20T08:00:00Z");
		const id = await book(start);
		const s = scheduler({ dayBeforeHours: 48, soonHours: 4 });
		await tickAt(s, start - 49 * HOUR);
		expect(sent("reminder.day_before", id)).toHaveLength(0);
		await tickAt(s, start - 48 * HOUR + 1000, start - 47 * HOUR, start - 24 * HOUR);
		expect(sent("reminder.day_before", id)).toHaveLength(1);
		await tickAt(s, start - 5 * HOUR);
		expect(sent("reminder.two_hours", id)).toHaveLength(0);
		await tickAt(s, start - 4 * HOUR + 1000, start - 2 * HOUR, start - HOUR);
		expect(sent("reminder.two_hours", id)).toHaveLength(1);
	});
});

describe("the day-before reminder waits out the client's quiet hours", () => {
	it("due in the clinic's quiet hours (21:00 to 08:00), it goes when they end, once", async () => {
		// 07:30 in Bucharest: the day before at 07:30 is quiet.
		const start = at("2026-11-20T05:30:00Z");
		const id = await book(start);
		const s = scheduler();
		await tickAt(s, start - 24 * HOUR + 1000, at("2026-11-19T05:45:00Z"));
		expect(sent("reminder.day_before", id)).toHaveLength(0);
		await tickAt(s, at("2026-11-19T06:00:00Z"), at("2026-11-19T06:15:00Z"));
		expect(sent("reminder.day_before", id)).toHaveLength(1);
	});

	it("the client's own quiet hours, chosen on their account, hold instead of the clinic's", async () => {
		const hash = accountHashOf("visitor-quiet");
		await w.store.keyed.put(
			"psizone",
			"link",
			`c/${w.ids.c1}`,
			0,
			JSON.stringify({ accountHash: hash }),
		);
		await w.store.keyed.put(
			"psizone",
			"prefs",
			`a/${hash}`,
			0,
			JSON.stringify({
				channels: {},
				quietHours: { start: "09:00", end: "12:00", timeZone: "Europe/Bucharest" },
			}),
		);
		// 10:00 in Bucharest: quiet for this client, not for the clinic.
		const start = at("2026-11-20T08:00:00Z");
		const id = await book(start);
		const s = scheduler();
		await tickAt(s, start - 24 * HOUR + 1000, at("2026-11-19T09:45:00Z"));
		expect(sent("reminder.day_before", id)).toHaveLength(0);
		await tickAt(s, at("2026-11-19T10:00:00Z"));
		expect(sent("reminder.day_before", id)).toHaveLength(1);
	});

	it("when waiting would leave too little before the nudge, it goes now (the notifier holds the push, not the e-mail)", async () => {
		// 09:00 in Bucharest with a 12-hour lead: due at 21:00, quiet until 08:00, an hour before the session.
		const start = at("2026-11-20T07:00:00Z");
		const id = await book(start);
		const s = scheduler({ dayBeforeHours: 12, soonHours: 2 });
		await tickAt(s, start - 12 * HOUR + 1000);
		expect(sent("reminder.day_before", id)).toHaveLength(1);
	});
});

describe("REMINDER_DAY_BEFORE_HOURS and REMINDER_SOON_HOURS", () => {
	const ENV = {
		OIDC_ISSUERS: JSON.stringify([
			{ issuer: "https://auth.test/application/o/clinic/", audiences: ["c"] },
		]),
		CLINIC_MASTER_KEY: "ab".repeat(32),
	};
	it("default to 24 and 2, and take whole hours in their bounds", () => {
		expect(loadConfig(ENV).reminders).toEqual(DEFAULT_LEADS);
		expect(
			loadConfig({ ...ENV, REMINDER_DAY_BEFORE_HOURS: "48", REMINDER_SOON_HOURS: "3" }).reminders,
		).toEqual({ dayBeforeHours: 48, soonHours: 3 });
	});
	it.each([
		["REMINDER_DAY_BEFORE_HOURS", "11"],
		["REMINDER_DAY_BEFORE_HOURS", "73"],
		["REMINDER_DAY_BEFORE_HOURS", "24.5"],
		["REMINDER_SOON_HOURS", "0"],
		["REMINDER_SOON_HOURS", "12"],
		["REMINDER_SOON_HOURS", "two"],
	])("refuses %s=%s, by name", (name, value) => {
		expect(() => loadConfig({ ...ENV, [name]: value })).toThrow(ConfigError);
		expect(() => loadConfig({ ...ENV, [name]: value })).toThrow(new RegExp(name));
	});
});
