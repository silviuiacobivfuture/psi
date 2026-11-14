import { describe, expect, it } from "vitest";
import type { AppointmentRow, RosterRow } from "../store/types";
import { offDuty, overlaps } from "./conflicts";

const HOUR = 3_600_000;
const T0 = Date.parse("2026-12-01T08:00:00Z"); // 10:00 in Bucharest
let n = 0;
const session = (over: Partial<AppointmentRow> = {}): AppointmentRow => {
	n += 1;
	return {
		id: `a${n}`,
		app: "psizone",
		kind: "session",
		status: "scheduled",
		practitionerId: "p1",
		clientId: "c1",
		start: T0,
		end: T0 + HOUR,
		remind: true,
		createdAt: 1,
		updatedAt: 1,
		...over,
	};
};

describe("two sessions at once", () => {
	it("one therapist, one room, one device: each is a conflict of its own kind, named by the earlier session first", () => {
		const a = session({ roomId: "r1", deviceId: "d1" });
		const b = session({
			start: T0 + 30 * 60_000,
			end: T0 + 90 * 60_000,
			roomId: "r1",
			deviceId: "d1",
		});
		const found = overlaps([b, a]);
		expect(found.map((c) => c.what).sort()).toEqual(["device", "practitioner", "room"]);
		for (const c of found)
			expect(c).toMatchObject({ appointmentId: a.id, otherAppointmentId: b.id, at: T0 });
	});
	it("back to back, other therapists, other rooms and nothing in common are not conflicts", () => {
		const a = session({ roomId: "r1" });
		expect(overlaps([a, session({ start: T0 + HOUR, end: T0 + 2 * HOUR, roomId: "r1" })])).toEqual(
			[],
		);
		expect(overlaps([a, session({ practitionerId: "p2", roomId: "r2" })])).toEqual([]);
		expect(overlaps([a])).toEqual([]);
		expect(overlaps([])).toEqual([]);
	});
	it("a cancelled, deleted, blocked, attended or group slot never conflicts with anything", () => {
		const a = session();
		for (const other of [
			session({ status: "cancelled" }),
			session({ deletedAt: 5 }),
			session({ kind: "block" }),
			session({ kind: "group" }),
			session({ status: "attended" }),
		])
			expect(overlaps([a, other])).toEqual([]);
	});
	it("three at once are three pairs, not one", () => {
		const rows = [session(), session(), session()];
		expect(overlaps(rows).filter((c) => c.what === "practitioner")).toHaveLength(3);
	});
});

describe("a session when the therapist is not working", () => {
	const day = (over: Partial<RosterRow>): RosterRow => ({
		id: "p1_2026-12-01",
		app: "psizone",
		personId: "p1",
		date: "2026-12-01",
		kind: "work",
		createdAt: 1,
		updatedAt: 1,
		...over,
	});
	const found = (rows: AppointmentRow[], roster: RosterRow | undefined) =>
		offDuty(
			rows,
			() => roster,
			() => "2026-12-01",
			"Europe/Bucharest",
		);

	it("a day off and leave are conflicts, a working day inside its hours is not", () => {
		const a = session();
		expect(found([a], day({ kind: "free" }))).toEqual([
			{ appointmentId: a.id, what: "roster", at: T0 },
		]);
		expect(found([a], day({ kind: "leave_co" }))).toHaveLength(1);
		expect(found([a], day({ kind: "leave_cm" }))).toHaveLength(1);
		expect(found([a], day({ kind: "work", start: 8 * 60, end: 18 * 60 }))).toEqual([]);
		expect(found([a], day({ kind: "work" }))).toEqual([]);
	});
	it("hours that start after it, or end before it ends, are conflicts; hours touching it are not", () => {
		const a = session();
		expect(found([a], day({ start: 11 * 60, end: 18 * 60 }))).toHaveLength(1);
		expect(found([a], day({ start: 8 * 60, end: 10 * 60 + 30 }))).toHaveLength(1);
		expect(found([a], day({ start: 10 * 60, end: 11 * 60 }))).toEqual([]);
	});
	it("no roster row means nobody said they are away; and dead sessions are not asked about", () => {
		expect(found([session()], undefined)).toEqual([]);
		expect(
			found([session({ status: "cancelled" }), session({ deletedAt: 1 })], day({ kind: "free" })),
		).toEqual([]);
	});
});
