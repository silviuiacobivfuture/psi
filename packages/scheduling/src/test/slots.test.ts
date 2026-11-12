import { describe, expect, it } from "vitest";
import type { ServiceSpec, WeeklyRule } from "../domain/catalog";
import { generateSlots, isOffered, type SlotQuery } from "../domain/slots";
import { formatClock, parseClock, resolveLocal, toLocal } from "../domain/time";

const ZONE = "Europe/Bucharest";
const HOUR = 3_600_000;

const SERVICE: ServiceSpec = {
	durationMinutes: 60,
	bufferMinutes: 0,
	stepMinutes: 60,
	minNoticeMinutes: 0,
	horizonDays: 60,
	holdMinutes: 10,
	modes: ["onsite", "online"],
};

function at(date: string, clock: string): number {
	const resolved = resolveLocal(date, parseClock(clock), ZONE);
	if (resolved.kind !== "exact") throw new Error(`${date} ${clock} is not exact`);
	return resolved.instant;
}

function rule(
	weekday: number,
	start: string,
	end: string,
	extra: Partial<WeeklyRule> = {},
): WeeklyRule {
	return { weekday, start: parseClock(start), end: parseClock(end), modes: ["onsite"], ...extra };
}

function query(over: Partial<SlotQuery>): SlotQuery {
	return {
		timeZone: ZONE,
		service: SERVICE,
		rules: [],
		exceptions: [],
		busy: [],
		from: Date.parse("2026-03-01T00:00:00Z"),
		to: Date.parse("2026-12-31T00:00:00Z"),
		now: Date.parse("2026-03-01T00:00:00Z"),
		...over,
	};
}

/** Slots as the wall clock reads them: `2026-03-29 09:00`. */
function wall(slots: ReadonlyArray<{ start: number }>): string[] {
	return slots.map((slot) => {
		const local = toLocal(slot.start, ZONE);
		return `${local.date} ${formatClock(local.minutes)}`;
	});
}

describe("slot generation across daylight saving", () => {
	it("keeps a 09:00 Sunday opening at 09:00 local on both sides of the spring change", () => {
		const slots = generateSlots(
			query({
				rules: [rule(7, "09:00", "11:00")],
				from: Date.parse("2026-03-22T00:00:00Z"),
				to: Date.parse("2026-03-30T00:00:00Z"),
			}),
		);
		expect(wall(slots)).toEqual([
			"2026-03-22 09:00",
			"2026-03-22 10:00",
			"2026-03-29 09:00",
			"2026-03-29 10:00",
		]);
		// The same wall time is an hour earlier in UTC once summer time starts.
		const [first, , third] = slots;
		expect(first?.start).toBe(Date.parse("2026-03-22T07:00:00Z"));
		expect(third?.start).toBe(Date.parse("2026-03-29T06:00:00Z"));
	});

	it("never offers a wall time the clocks skip, and never runs past the window", () => {
		const slots = generateSlots(
			query({
				rules: [rule(7, "02:00", "05:00")],
				from: Date.parse("2026-03-28T00:00:00Z"),
				to: Date.parse("2026-03-30T00:00:00Z"),
			}),
		);
		expect(wall(slots)).toEqual(["2026-03-29 02:00", "2026-03-29 04:00"]);
		for (const slot of slots) expect(slot.end - slot.start).toBe(HOUR);
		expect(slots.at(-1)?.end).toBe(at("2026-03-29", "05:00"));
	});

	it("offers a repeated wall time once, at its first occurrence", () => {
		const slots = generateSlots(
			query({
				rules: [rule(7, "02:00", "05:00")],
				from: Date.parse("2026-10-24T00:00:00Z"),
				to: Date.parse("2026-10-26T00:00:00Z"),
				now: Date.parse("2026-10-20T00:00:00Z"),
			}),
		);
		expect(wall(slots)).toEqual(["2026-10-25 02:00", "2026-10-25 03:00", "2026-10-25 04:00"]);
		expect(new Set(slots.map((s) => s.start)).size).toBe(slots.length);
		const repeated = resolveLocal("2026-10-25", parseClock("03:00"), ZONE);
		expect(repeated.kind).toBe("ambiguous");
		if (repeated.kind === "ambiguous") expect(slots[1]?.start).toBe(repeated.earlier);
	});

	it("keeps durations in real time: a 90-minute slot never spans past a window that the gap shortened", () => {
		const slots = generateSlots(
			query({
				service: { ...SERVICE, durationMinutes: 90, stepMinutes: 30 },
				rules: [rule(7, "01:00", "05:00")],
				from: Date.parse("2026-03-28T00:00:00Z"),
				to: Date.parse("2026-03-30T00:00:00Z"),
			}),
		);
		const end = at("2026-03-29", "05:00");
		for (const slot of slots) {
			expect(slot.end - slot.start).toBe(90 * 60_000);
			expect(slot.end).toBeLessThanOrEqual(end);
		}
		expect(wall(slots)).toEqual([
			"2026-03-29 01:00",
			"2026-03-29 01:30",
			"2026-03-29 02:00",
			"2026-03-29 02:30",
		]);
	});
});

describe("slot generation from rules, exceptions and bookings", () => {
	const WEEK = {
		from: Date.parse("2026-11-16T00:00:00Z"),
		to: Date.parse("2026-11-21T00:00:00Z"),
		now: Date.parse("2026-11-15T00:00:00Z"),
	};
	const MONDAY = [rule(1, "09:00", "12:00")];

	it("drops what is busy, with the buffer on the new slot", () => {
		const busy = [{ start: at("2026-11-16", "10:00"), until: at("2026-11-16", "11:00") }];
		expect(wall(generateSlots(query({ ...WEEK, rules: MONDAY, busy })))).toEqual([
			"2026-11-16 09:00",
			"2026-11-16 11:00",
		]);
		const buffered = { ...SERVICE, bufferMinutes: 15 };
		expect(wall(generateSlots(query({ ...WEEK, rules: MONDAY, busy, service: buffered })))).toEqual(
			["2026-11-16 11:00"],
		);
	});

	it("closes a whole day, part of a day, and opens an extra window", () => {
		expect(
			generateSlots(
				query({ ...WEEK, rules: MONDAY, exceptions: [{ date: "2026-11-16", kind: "closed" }] }),
			),
		).toEqual([]);
		const part = generateSlots(
			query({
				...WEEK,
				rules: MONDAY,
				exceptions: [
					{
						date: "2026-11-16",
						kind: "closed",
						start: parseClock("10:00"),
						end: parseClock("11:00"),
					},
				],
			}),
		);
		expect(wall(part)).toEqual(["2026-11-16 09:00", "2026-11-16 11:00"]);
		const extra = generateSlots(
			query({
				...WEEK,
				rules: MONDAY,
				exceptions: [
					{
						date: "2026-11-18",
						kind: "open",
						start: parseClock("16:00"),
						end: parseClock("17:00"),
					},
				],
			}),
		);
		expect(wall(extra)).toContain("2026-11-18 16:00");
	});

	it("respects notice, horizon, validity and modes", () => {
		const now = at("2026-11-16", "09:30");
		const noticed = generateSlots(
			query({ ...WEEK, now, rules: MONDAY, service: { ...SERVICE, minNoticeMinutes: 60 } }),
		);
		expect(wall(noticed)).toEqual(["2026-11-16 11:00"]);
		const horizon = generateSlots(
			query({
				from: WEEK.from,
				to: Date.parse("2027-01-31T00:00:00Z"),
				now: WEEK.now,
				rules: MONDAY,
				service: { ...SERVICE, horizonDays: 7 },
			}),
		);
		expect(wall(horizon)).toEqual(["2026-11-16 09:00", "2026-11-16 10:00", "2026-11-16 11:00"]);
		const valid = generateSlots(
			query({ ...WEEK, rules: [rule(1, "09:00", "12:00", { validFrom: "2026-11-17" })] }),
		);
		expect(valid).toEqual([]);
		const online = generateSlots(query({ ...WEEK, rules: MONDAY, mode: "online" }));
		expect(online).toEqual([]);
	});

	it("merges overlapping rules into one slot per start", () => {
		const slots = generateSlots(
			query({
				...WEEK,
				rules: [rule(1, "09:00", "11:00"), rule(1, "10:00", "12:00", { modes: ["online"] })],
			}),
		);
		expect(wall(slots)).toEqual(["2026-11-16 09:00", "2026-11-16 10:00", "2026-11-16 11:00"]);
		expect(slots[1]?.modes).toEqual(["onsite", "online"]);
	});

	it("isOffered accepts a generated start and refuses one off the grid or busy", () => {
		const { from: _f, to: _t, ...calendar } = query({ ...WEEK, rules: MONDAY });
		expect(isOffered(calendar, at("2026-11-16", "10:00"), "onsite")).toBe(true);
		expect(isOffered(calendar, at("2026-11-16", "10:07"), "onsite")).toBe(false);
		expect(isOffered(calendar, at("2026-11-16", "10:00"), "online")).toBe(false);
		const busy = [{ start: at("2026-11-16", "10:30"), until: at("2026-11-16", "10:45") }];
		expect(isOffered({ ...calendar, busy }, at("2026-11-16", "10:00"), "onsite")).toBe(false);
	});
});
