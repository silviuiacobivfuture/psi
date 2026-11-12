import { describe, expect, it } from "vitest";
import type { RoomNeed, ServiceSpec, WeeklyRule } from "../domain/catalog";
import {
	closureSpans,
	pickRoom,
	type RoomCalendar,
	type RoomSpec,
	roomSuits,
} from "../domain/rooms";
import { generateSlots, type SlotQuery, weekOf } from "../domain/slots";
import { parseClock, resolveLocal, toLocal } from "../domain/time";

const ZONE = "Europe/Bucharest";
const HOUR = 3_600_000;
const SERVICE: ServiceSpec = {
	durationMinutes: 60,
	bufferMinutes: 0,
	stepMinutes: 60,
	minNoticeMinutes: 0,
	horizonDays: 90,
	holdMinutes: 10,
	modes: ["onsite", "online"],
};

function at(date: string, clock: string): number {
	const r = resolveLocal(date, parseClock(clock), ZONE);
	if (r.kind !== "exact") throw new Error("not exact");
	return r.instant;
}
const rule = (
	weekday: number,
	start: string,
	end: string,
	extra: Partial<WeeklyRule> = {},
): WeeklyRule => ({
	weekday,
	start: parseClock(start),
	end: parseClock(end),
	modes: ["onsite"],
	...extra,
});
const days = (q: Partial<SlotQuery>, from: string, to: string): string[] => [
	...new Set(
		generateSlots({
			timeZone: ZONE,
			service: SERVICE,
			rules: [],
			exceptions: [],
			busy: [],
			from: at(from, "00:00"),
			to: at(to, "00:00"),
			now: at(from, "00:00") - 24 * HOUR,
			...q,
		}).map((s) => toLocal(s.start, ZONE).date),
	),
];

describe("alternating weeks", () => {
	it("names the anchor's week A, the next B, and counts back before it", () => {
		expect(weekOf("2026-11-09", "2026-11-09")).toBe("A");
		expect(weekOf("2026-11-15", "2026-11-09")).toBe("A");
		expect(weekOf("2026-11-16", "2026-11-09")).toBe("B");
		expect(weekOf("2026-11-23", "2026-11-09")).toBe("A");
		expect(weekOf("2026-11-02", "2026-11-09")).toBe("B");
		expect(weekOf("2026-10-26", "2026-11-09")).toBe("A");
	});
	it("keeps the rhythm across the clock change (a 23-hour weekend)", () => {
		// 28 March 2027 is the spring change: week of 22 March, B if 15 March is A.
		expect(weekOf("2027-03-22", "2027-03-15")).toBe("B");
		expect(weekOf("2027-03-29", "2027-03-15")).toBe("A");
	});
	it("offers an A-only Monday every other week", () => {
		const d = days(
			{ rules: [rule(1, "09:00", "10:00", { week: "A" })], abAnchor: "2026-11-09" },
			"2026-11-09",
			"2026-12-07",
		);
		expect(d).toEqual(["2026-11-09", "2026-11-23"]);
	});
	it("offers A and B patterns on their own weeks", () => {
		const d = days(
			{
				rules: [rule(2, "09:00", "10:00", { week: "A" }), rule(3, "09:00", "10:00", { week: "B" })],
				abAnchor: "2026-11-09",
			},
			"2026-11-09",
			"2026-11-23",
		);
		expect(d).toEqual(["2026-11-10", "2026-11-18"]);
	});
});

describe("period schedules", () => {
	const base = [1, 2, 3, 4, 5].map((w) => rule(w, "09:00", "10:00"));
	const holiday = [1, 2, 3, 4].map((w) =>
		rule(w, "10:00", "11:00", {
			validFrom: "2026-12-21",
			validUntil: "2027-01-03",
			override: true,
		}),
	);
	it("replaces the regular week inside the period, and only inside it", () => {
		const d = days({ rules: [...base, ...holiday] }, "2026-12-14", "2027-01-11");
		expect(d).toContain("2026-12-18"); // Friday before: regular
		expect(d).not.toContain("2026-12-25"); // Friday inside: the holiday week has none
		expect(d).toContain("2026-12-22");
		expect(d).toContain("2027-01-04");
		const inside = generateSlots({
			timeZone: ZONE,
			service: SERVICE,
			rules: [...base, ...holiday],
			exceptions: [],
			busy: [],
			from: at("2026-12-22", "00:00"),
			to: at("2026-12-23", "00:00"),
			now: at("2026-12-01", "00:00"),
		});
		expect(inside.map((s) => toLocal(s.start, ZONE).minutes)).toEqual([600]);
	});
	it("a period that is not an override adds to the regular week", () => {
		const extra = [
			rule(6, "09:00", "10:00", { validFrom: "2026-12-01", validUntil: "2026-12-31" }),
		];
		expect(days({ rules: [...base, ...extra] }, "2026-12-05", "2026-12-07")).toEqual([
			"2026-12-05",
		]);
	});
	it("refuses an override without a start date", async () => {
		const { ruleProblem } = await import("../domain/catalog");
		expect(ruleProblem(rule(1, "09:00", "10:00", { override: true }))).toBe(
			"a period needs a start",
		);
	});
});

describe("buffers and clock changes", () => {
	it("a buffer after a session blocks the next start", () => {
		const q = { ...SERVICE, bufferMinutes: 30 };
		const slots = generateSlots({
			timeZone: ZONE,
			service: q,
			rules: [rule(1, "09:00", "13:00")],
			exceptions: [],
			busy: [{ start: at("2026-11-16", "10:00"), until: at("2026-11-16", "11:30") }],
			from: at("2026-11-16", "00:00"),
			to: at("2026-11-17", "00:00"),
			now: at("2026-11-01", "00:00"),
		});
		// 09:00 would run to 10:30 with its buffer and so hits the 10:00 block; 11:00 hits it too.
		expect(slots.map((s) => toLocal(s.start, ZONE).minutes)).toEqual([720]);
	});
	it("keeps 09:00 local across the spring change, and a Sunday of 23 hours loses nothing", () => {
		const slots = generateSlots({
			timeZone: ZONE,
			service: SERVICE,
			rules: [1, 7].map((w) => rule(w, "09:00", "10:00")),
			exceptions: [],
			busy: [],
			from: at("2027-03-22", "00:00"),
			to: at("2027-03-30", "00:00"),
			now: at("2027-03-01", "00:00"),
		});
		expect(slots.map((s) => toLocal(s.start, ZONE).minutes)).toEqual([540, 540, 540]);
		const offset = slots.map((s) => (s.start - at("2027-03-22", "09:00")) / HOUR);
		expect(offset).toEqual([0, 6 * 24 - 1, 7 * 24 - 1]);
	});
});

const room = (id: string, over: Partial<RoomSpec> = {}): RoomSpec => ({
	id,
	kind: "therapy",
	capacity: 2,
	suits: ["child", "teen", "adult"],
	equipment: [],
	...over,
});
const need: RoomNeed = { kind: "therapy", equipment: [], audiences: [] };
const cal = (r: RoomSpec, busy: RoomCalendar["busy"] = []): RoomCalendar => ({ room: r, busy });
const span = { start: 1000, until: 2000 };

describe("rooms", () => {
	it("suits by kind, equipment and audience", () => {
		const r = room("a", { kind: "neurofeedback", equipment: ["eeg"], suits: ["child"] });
		expect(roomSuits(r, { kind: "neurofeedback", equipment: ["eeg"], audiences: ["child"] })).toBe(
			true,
		);
		expect(roomSuits(r, { kind: "therapy", equipment: [], audiences: [] })).toBe(false);
		expect(roomSuits(r, { kind: "neurofeedback", equipment: ["tms"], audiences: [] })).toBe(false);
		expect(roomSuits(r, { kind: "neurofeedback", equipment: [], audiences: ["adult"] })).toBe(
			false,
		);
	});
	it("picks the first free suitable room, so a room is never double-booked", () => {
		const a = room("a");
		const b = room("b");
		expect(pickRoom([cal(a), cal(b)], need, span)?.id).toBe("a");
		expect(pickRoom([cal(a, [{ start: 1500, until: 3000 }]), cal(b)], need, span)?.id).toBe("b");
		expect(
			pickRoom(
				[cal(a, [{ start: 0, until: 1001 }]), cal(b, [{ start: 1999, until: 3000 }])],
				need,
				span,
			),
		).toBeUndefined();
		// touching spans do not overlap
		expect(pickRoom([cal(a, [{ start: 2000, until: 3000 }])], need, span)?.id).toBe("a");
	});
	it("honours a practitioner's allowed rooms, and an empty list means any", () => {
		const rooms = [cal(room("a")), cal(room("b"))];
		expect(pickRoom(rooms, need, span, ["b"])?.id).toBe("b");
		expect(pickRoom(rooms, need, span, ["c"])).toBeUndefined();
		expect(pickRoom(rooms, need, span, [])?.id).toBe("a");
	});
	it("turns closures into spans, whole dates included, across a 23-hour day", () => {
		const [whole, part] = closureSpans(
			[{ date: "2027-03-28" }, { date: "2026-11-16", start: 600, end: 720 }],
			ZONE,
		);
		expect(((whole?.until ?? 0) - (whole?.start ?? 0)) / HOUR).toBe(23);
		expect(((part?.until ?? 0) - (part?.start ?? 0)) / HOUR).toBe(2);
		const closed = room("a");
		expect(
			pickRoom([cal(closed, closureSpans([{ date: "2026-11-16" }], ZONE))], need, {
				start: at("2026-11-16", "10:00"),
				until: at("2026-11-16", "11:00"),
			}),
		).toBeUndefined();
	});
});
