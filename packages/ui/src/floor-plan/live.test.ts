import { describe, expect, it } from "vitest";
import {
	covers,
	deviceStateAt,
	HEAT_LEVELS,
	isBlocking,
	roomDay,
	roomLiveAt,
	snapshotAt,
	unionMinutes,
	weekHeat,
} from "./live";
import { type LiveBooking, type LiveData, LiveDataSchema } from "./live-types";
import { addDays, clockOf, dateOf, dayRange, dayStart, MINUTE, mondayOf } from "./zone";

const TZ = "Europe/Bucharest";
const H = 60 * MINUTE;
const base = dayStart("2026-11-13", TZ);
const at = (h: number, m = 0) => base + h * H + m * MINUTE;
const withClients = { seeClients: true };
const without = { seeClients: false };

const room = (over: Partial<LiveData["rooms"][number]> = {}) => ({
	id: "nfb-1",
	name: "NFB 1",
	kind: "neurofeedback",
	capacity: 2,
	equipment: [],
	closures: [],
	...over,
});
const booking = (
	id: string,
	start: number,
	until: number,
	over: Partial<LiveBooking> = {},
): LiveBooking => ({
	id,
	roomId: "nfb-1",
	start,
	until,
	status: "confirmed",
	practitioner: { name: "Ana Pop", monogram: "AP" },
	service: "Neurofeedback",
	people: 1,
	shared: false,
	deviceIds: [],
	clientInitials: ["CM"],
	...over,
});
const NOW = at(8);

describe("room state at an instant", () => {
	const r = room();
	const b = [booking("a", at(10), at(11))];
	it("is free before, booked from the start instant (inclusive), free again at the end instant (exclusive)", () => {
		expect(roomLiveAt(r, b, at(10) - 1, NOW, withClients).state).toBe("free");
		expect(roomLiveAt(r, b, at(10), NOW, withClients).state).toBe("booked");
		expect(roomLiveAt(r, b, at(11) - 1, NOW, withClients).state).toBe("booked");
		expect(roomLiveAt(r, b, at(11), NOW, withClients).state).toBe("free");
	});
	it("back-to-back bookings never clash at the shared instant", () => {
		const two = [booking("a", at(10), at(11)), booking("b", at(11), at(12))];
		expect(roomLiveAt(r, two, at(11), NOW, withClients)).toMatchObject({
			state: "booked",
			active: [{ id: "b" }],
		});
	});
	it("says when the state changes and when the next booking starts", () => {
		expect(roomLiveAt(r, b, at(10, 30), NOW, withClients).changesAt).toBe(at(11));
		expect(roomLiveAt(r, b, at(9), NOW, withClients)).toMatchObject({
			state: "free",
			nextStart: at(10),
		});
		expect(roomLiveAt(r, b, at(12), NOW, withClients).nextStart).toBeUndefined();
	});
	it("a closure closes the room on [start, until)", () => {
		const closed = room({ closures: [{ start: at(14), until: at(16), reason: "Mentenanță" }] });
		expect(roomLiveAt(closed, [], at(14) - 1, NOW, withClients).state).toBe("free");
		expect(roomLiveAt(closed, [], at(14), NOW, withClients)).toMatchObject({
			state: "closed",
			closure: { reason: "Mentenanță" },
		});
		expect(roomLiveAt(closed, [], at(16), NOW, withClients).state).toBe("free");
	});
	it("a booking inside a closure is a conflict", () => {
		const closed = room({ closures: [{ start: at(9), until: at(18) }] });
		expect(roomLiveAt(closed, b, at(10), NOW, withClients).state).toBe("conflict");
	});
	it("two overlapping private bookings are a conflict; the overlap's edges are exact", () => {
		const two = [booking("a", at(10), at(11)), booking("b", at(10, 30), at(11, 30))];
		expect(roomLiveAt(r, two, at(10, 29), NOW, withClients).state).toBe("booked");
		expect(roomLiveAt(r, two, at(10, 30), NOW, withClients).state).toBe("conflict");
		expect(roomLiveAt(r, two, at(11), NOW, withClients).state).toBe("booked");
	});
	it("a group room takes shared bookings up to its capacity and conflicts over it", () => {
		const group = room({ id: "grup", capacity: 10 });
		const mk = (id: string, people: number) =>
			booking(id, at(10), at(11), { roomId: "grup", shared: true, people });
		expect(roomLiveAt(group, [mk("a", 6), mk("b", 4)], at(10), NOW, withClients).state).toBe(
			"booked",
		);
		expect(roomLiveAt(group, [mk("a", 6), mk("b", 5)], at(10), NOW, withClients).state).toBe(
			"conflict",
		);
		expect(roomLiveAt(group, [mk("a", 11)], at(10), NOW, withClients).state).toBe("conflict");
	});
	it("a shared booking beside a private one is a conflict", () => {
		const group = room({ capacity: 10 });
		const two = [booking("a", at(10), at(11), { shared: true }), booking("b", at(10), at(11))];
		expect(roomLiveAt(group, two, at(10), NOW, withClients).state).toBe("conflict");
	});
	it("only blocking bookings count: cancelled, declined and expired do not; a held one only until its hold lapses", () => {
		for (const status of ["cancelled", "declined", "expired"] as const) {
			expect(
				roomLiveAt(r, [booking("a", at(10), at(11), { status })], at(10), NOW, withClients).state,
			).toBe("free");
		}
		expect(
			roomLiveAt(
				r,
				[booking("a", at(10), at(11), { status: "requested" })],
				at(10),
				NOW,
				withClients,
			).state,
		).toBe("booked");
		const held = booking("h", at(10), at(11), { status: "held", holdExpiresAt: at(9) });
		expect(isBlocking(held, at(9) - 1)).toBe(true);
		expect(isBlocking(held, at(9))).toBe(false);
		expect(isBlocking({ ...held, holdExpiresAt: undefined }, 0)).toBe(false);
		expect(roomLiveAt(r, [held], at(10), at(9), withClients).state).toBe("free");
	});
	it("ignores other rooms' bookings", () => {
		expect(
			roomLiveAt(r, [booking("a", at(10), at(11), { roomId: "other" })], at(10), NOW, withClients)
				.state,
		).toBe("free");
	});
	it("covers is half-open", () => {
		expect(covers({ start: 5, until: 10 }, 5)).toBe(true);
		expect(covers({ start: 5, until: 10 }, 10)).toBe(false);
	});
});

describe("field visibility", () => {
	const b = [booking("a", at(10), at(11), { clientInitials: ["ZQ"] })];
	it("shows the practitioner and the service to everyone, and the client's initials only to a viewer who may see clients", () => {
		const yes = roomLiveAt(room(), b, at(10), NOW, withClients);
		const no = roomLiveAt(room(), b, at(10), NOW, without);
		expect(JSON.stringify(yes)).toContain("ZQ");
		expect(JSON.stringify(no)).not.toContain("ZQ");
		expect(no.active[0]).toMatchObject({ monogram: "AP", service: "Neurofeedback", until: at(11) });
		expect(Object.keys(no.active[0] ?? {})).not.toContain("clientInitials");
	});
	it("the day's timeline and the snapshot are redacted the same way", () => {
		const day = roomDay(room(), b, at(0), at(23), NOW, without);
		expect(JSON.stringify(day)).not.toContain("ZQ");
		const snap = snapshotAt({ rooms: [room()], bookings: b, devices: [] }, at(10), NOW, without);
		expect(JSON.stringify([...snap.rooms])).not.toContain("ZQ");
		expect(JSON.stringify(roomDay(room(), b, at(0), at(23), NOW, withClients))).toContain("ZQ");
	});
});

describe("devices", () => {
	it("are in use during a booking that names them and free outside", () => {
		const d = { id: "amp-1", name: "Amplificator 1" };
		const b = [booking("a", at(10), at(11), { deviceIds: ["amp-1"] })];
		expect(deviceStateAt(d, b, at(10), NOW)).toBe("in-use");
		expect(deviceStateAt(d, b, at(11), NOW)).toBe("free");
		expect(deviceStateAt({ id: "other", name: "x" }, b, at(10), NOW)).toBe("free");
	});
});

describe("the DST day, 2026-10-25 (Bucharest clocks go back at 04:00)", () => {
	const d = "2026-10-25";
	const { start, end } = dayRange(d, TZ);
	it("is 25 hours long, and its neighbours 24", () => {
		expect((end - start) / H).toBe(25);
		const n = dayRange("2026-10-24", TZ);
		expect((n.end - n.start) / H).toBe(24);
		expect(dayStart("2026-10-26", TZ)).toBe(end);
	});
	it("the clock reads 03:30 twice", () => {
		const reads = [];
		for (let t = start; t < end; t += 30 * MINUTE) reads.push(clockOf(t, TZ));
		expect(reads.filter((c) => c === "03:30")).toHaveLength(2);
		expect(reads).toHaveLength(50);
	});
	it("a booking is judged on real time: 03:30 the second time is a different instant from the first", () => {
		const firstOf0330 = start + 3 * H + 30 * MINUTE;
		const secondOf0330 = firstOf0330 + H;
		const b = [booking("a", secondOf0330, secondOf0330 + H)];
		expect(roomLiveAt(room(), b, firstOf0330, NOW, withClients).state).toBe("free");
		expect(roomLiveAt(room(), b, secondOf0330, NOW, withClients).state).toBe("booked");
		expect(clockOf(firstOf0330, TZ)).toBe(clockOf(secondOf0330, TZ));
	});
	it("the spring day is 23 hours", () => {
		const s = dayRange("2026-03-29", TZ);
		expect((s.end - s.start) / H).toBe(23);
	});
	it("dateOf and the day's last minute agree on the date", () => {
		expect(dateOf(end - 1, TZ)).toBe(d);
		expect(dateOf(end, TZ)).toBe("2026-10-26");
	});
	it("booked minutes across the DST day count real time", () => {
		const whole = [booking("a", start, end)];
		expect(unionMinutes(whole, start, end)).toBe(25 * 60);
	});
});

describe("week heat", () => {
	const week = mondayOf("2026-11-13");
	const from = dayStart(week, TZ);
	const to = dayStart(addDays(week, 7), TZ);
	const data: LiveData = LiveDataSchema.parse({
		rooms: [room({ id: "a" }), room({ id: "b" }), room({ id: "c" })],
		bookings: [
			booking("1", at(10), at(12), { roomId: "a" }),
			booking("2", at(11), at(13), { roomId: "a" }),
			booking("3", at(10), at(11), { roomId: "b" }),
		],
	});
	it("starts on Monday", () => {
		expect(week).toBe("2026-11-09");
		expect(mondayOf("2026-11-15")).toBe("2026-11-09");
		expect(mondayOf("2026-11-09")).toBe("2026-11-09");
	});
	it("counts a room's overlapping bookings once and levels against the busiest room", () => {
		const heat = weekHeat(data, from, to, NOW);
		expect(heat.find((h) => h.roomId === "a")).toMatchObject({
			minutes: 180,
			level: HEAT_LEVELS - 1,
		});
		expect(heat.find((h) => h.roomId === "b")).toMatchObject({ minutes: 60, level: 2 });
		expect(heat.find((h) => h.roomId === "c")).toMatchObject({ minutes: 0, level: 0 });
	});
	it("an empty week is level 0 everywhere, and a booking outside the week counts for nothing", () => {
		expect(weekHeat({ ...data, bookings: [] }, from, to, NOW).every((h) => h.level === 0)).toBe(
			true,
		);
		expect(weekHeat(data, to, to + 7 * 24 * H, NOW).every((h) => h.minutes === 0)).toBe(true);
	});
	it("a booking cut by the week's edge counts only its inside part", () => {
		expect(unionMinutes([{ start: from - H, until: from + H }], from, to)).toBe(60);
	});
});

describe("a room's day", () => {
	it("lists bookings and closures in order, flagging clashes", () => {
		const r = room({ closures: [{ start: at(15), until: at(16), reason: "Curățenie" }] });
		const b = [
			booking("b", at(10), at(11)),
			booking("a", at(9), at(10, 30)),
			booking("c", at(15, 30), at(16, 30)),
		];
		const day = roomDay(r, b, at(0), at(24), NOW, withClients);
		expect(day.map((e) => e.booking?.id ?? e.kind)).toEqual(["a", "b", "closure", "c"]);
		expect(day.map((e) => e.conflict)).toEqual([true, true, false, true]);
	});
	it("leaves out what does not touch the day", () => {
		expect(
			roomDay(room(), [booking("a", at(25), at(26))], at(0), at(24), NOW, withClients),
		).toEqual([]);
	});
});

describe("live data boundary", () => {
	it("parses defaults and refuses a booking that ends before it starts", () => {
		expect(LiveDataSchema.safeParse({ rooms: [], bookings: [] }).success).toBe(true);
		const bad = { rooms: [], bookings: [{ ...booking("a", 10, 10) }] };
		expect(LiveDataSchema.safeParse(bad).success).toBe(false);
	});
});
