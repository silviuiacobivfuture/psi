import { describe, expect, it } from "vitest";
import type { QuietHours } from "./apps";
import { entryFor } from "./catalogue";
import { applyPrefs, type Prefs } from "./prefs";

const NOON = Date.parse("2026-11-20T10:00:00Z"); // 12:00 in Bucharest
const NIGHT = Date.parse("2026-11-20T22:00:00Z"); // 00:00 in Bucharest
const QUIET: QuietHours = { start: "21:00", end: "08:00", timeZone: "Europe/Bucharest" };

function entry(event: Parameters<typeof entryFor>[0], audience: Parameters<typeof entryFor>[1]) {
	const found = entryFor(event, audience);
	if (found === undefined) throw new Error(`no entry ${event}/${audience}`);
	return found;
}
const apply = (
	e: ReturnType<typeof entry>,
	prefs: Prefs | undefined,
	over: { now?: number; appQuiet?: QuietHours | null; hasEmail?: boolean } = {},
) =>
	applyPrefs({
		entry: e,
		prefs,
		appQuiet: over.appQuiet === undefined ? null : over.appQuiet,
		now: over.now ?? NOON,
		hasEmail: over.hasEmail ?? true,
	});

describe("preferences: defaults", () => {
	it("a person who chose nothing gets the catalogue's default channels", () => {
		expect(apply(entry("appointment.confirmed", "client"), undefined).channels).toEqual({
			in_app: false,
			push: true,
			email: true,
		});
		// The two-hour reminder is a push by default; its e-mail waits until it is chosen.
		expect(apply(entry("reminder.two_hours", "client"), undefined).channels).toEqual({
			in_app: false,
			push: true,
			email: false,
		});
		expect(apply(entry("reminder.two_hours", "client"), undefined).suppressed).toEqual({
			email: "preference",
		});
	});
	it("an empty set of choices is the same as none", () => {
		const e = entry("digest.owner_daily", "owners");
		expect(apply(e, { channels: {}, quietHours: null })).toEqual(apply(e, undefined));
	});
});

describe("preferences: choices by kind and channel", () => {
	it("switches one channel of one kind and leaves the others", () => {
		const prefs: Prefs = { channels: { reminders: { push: false } }, quietHours: null };
		const a = apply(entry("reminder.day_before", "client"), prefs);
		expect(a.channels).toEqual({ in_app: false, push: false, email: true });
		expect(a.suppressed).toEqual({ push: "preference" });
		expect(apply(entry("appointment.moved", "client"), prefs).channels.push).toBe(true);
	});
	it("turns a channel ON that the default leaves off", () => {
		const prefs: Prefs = { channels: { reminders: { email: true } }, quietHours: null };
		expect(apply(entry("reminder.two_hours", "client"), prefs).channels.email).toBe(true);
	});
	it("everything off leaves nothing to send", () => {
		const prefs: Prefs = {
			channels: { reminders: { in_app: false, push: false, email: false } },
			quietHours: null,
		};
		const a = apply(entry("reminder.day_before", "client"), prefs);
		expect(Object.values(a.channels).some(Boolean)).toBe(false);
	});
	it("a channel the entry does not offer cannot be switched on", () => {
		const prefs: Prefs = { channels: { account: { push: true, in_app: true } }, quietHours: null };
		const a = apply(entry("account.invite", "client"), prefs);
		expect(a.channels).toEqual({ in_app: false, push: false, email: true });
		expect(a.suppressed).toEqual({});
	});
});

describe("preferences: locked channels", () => {
	it("an invitation's e-mail stays on whatever was chosen", () => {
		const prefs: Prefs = { channels: { account: { email: false } }, quietHours: null };
		expect(apply(entry("account.invite", "client"), prefs).channels.email).toBe(true);
	});
	it("the confirmation of an appointment keeps its e-mail, but its push can be switched off", () => {
		const prefs: Prefs = {
			channels: { appointments: { email: false, push: false } },
			quietHours: null,
		};
		const a = apply(entry("appointment.confirmed", "client"), prefs);
		expect(a.channels).toEqual({ in_app: false, push: false, email: true });
	});
	it("a sensitive-action notice keeps its bell for owners", () => {
		const prefs: Prefs = { channels: { security: { in_app: false } }, quietHours: null };
		expect(apply(entry("security.action", "owners"), prefs).channels.in_app).toBe(true);
	});
});

describe("preferences: quiet hours", () => {
	it("hold push back inside the app's quiet hours and release it by day", () => {
		const e = entry("appointment.moved", "practitioner");
		const night = apply(e, undefined, { now: NIGHT, appQuiet: QUIET });
		expect(night.channels).toEqual({ in_app: true, push: false, email: false });
		expect(night.suppressed).toEqual({ push: "quiet-hours" });
		expect(apply(e, undefined, { now: NOON, appQuiet: QUIET }).channels.push).toBe(true);
	});
	it("the person's own hours replace the app's, in either direction", () => {
		const e = entry("appointment.moved", "practitioner");
		const day: Prefs = {
			channels: {},
			quietHours: { start: "09:00", end: "17:00", timeZone: "Europe/Bucharest" },
		};
		expect(apply(e, day, { now: NOON, appQuiet: null }).channels.push).toBe(false);
		expect(apply(e, day, { now: NIGHT, appQuiet: QUIET }).channels.push).toBe(true);
	});
	it("a person with no hours of their own follows the app", () => {
		const e = entry("appointment.moved", "practitioner");
		expect(
			apply(e, { channels: {}, quietHours: null }, { now: NIGHT, appQuiet: QUIET }).channels.push,
		).toBe(false);
	});
	it("the bell and the e-mail ignore quiet hours", () => {
		const e = entry("request.new", "team");
		const a = apply(e, undefined, { now: NIGHT, appQuiet: QUIET });
		expect(a.channels).toEqual({ in_app: true, push: false, email: true });
	});
	it("equal start and end is no quiet time at all", () => {
		const e = entry("appointment.moved", "practitioner");
		const none: Prefs = {
			channels: {},
			quietHours: { start: "08:00", end: "08:00", timeZone: "Europe/Bucharest" },
		};
		expect(apply(e, none, { now: NIGHT }).channels.push).toBe(true);
	});
});

describe("preferences: addresses", () => {
	it("an e-mail with no address cannot go, and says so", () => {
		const a = apply(entry("reminder.day_before", "client"), undefined, { hasEmail: false });
		expect(a.channels).toEqual({ in_app: false, push: true, email: false });
		expect(a.suppressed).toEqual({ email: "no-address" });
	});
	it("a client with only e-mail and no address has nothing to send", () => {
		const a = apply(entry("account.invite", "client"), undefined, { hasEmail: false });
		expect(Object.values(a.channels).some(Boolean)).toBe(false);
		expect(a.suppressed).toEqual({ email: "no-address" });
	});
});
