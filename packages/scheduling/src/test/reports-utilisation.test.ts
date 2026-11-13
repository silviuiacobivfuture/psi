import { describe, expect, it } from "vitest";
import type { ReportBlock, ReportRosterDay } from "../clinic/reports/types";
import { utilisationReport } from "../clinic/reports/utilisation";
import { at, days, entry } from "./reports-fixtures";

const works = (
	date: string,
	from: number,
	to: number,
	id = "p1",
	kind: "practitioner" | "staff" = "practitioner",
): ReportRosterDay => ({
	person: { kind, id },
	date,
	entry: { status: "works", startMinutes: from, endMinutes: to },
});
const off = (
	date: string,
	status: "annual_leave" | "medical_leave" | "free",
	id = "p1",
): ReportRosterDay => ({
	person: { kind: "practitioner", id },
	date,
	entry: { status },
});

describe("utilisationReport", () => {
	const range = days("2026-11-09", "2026-11-13");

	it("is empty for nothing", () => {
		expect(utilisationReport([], [], [], range)).toEqual({
			practitioners: [],
			rooms: [],
			devices: [],
		});
	});

	it("one practitioner, one day, one visit: booked over available", () => {
		const out = utilisationReport(
			[entry("2026-11-09", "09:00", "11:00")],
			[works("2026-11-09", 480, 960)],
			[],
			range,
		);
		expect(out.practitioners).toEqual([
			{ id: "p1", availableMinutes: 480, bookedMinutes: 120, outsideMinutes: 0, rate: 0.25 },
		]);
	});

	it("a fully booked day is exactly 1, and the rate never hides time outside the windows", () => {
		const full = utilisationReport(
			[entry("2026-11-09", "08:00", "16:00")],
			[works("2026-11-09", 480, 960)],
			[],
			range,
		);
		expect(full.practitioners[0]).toMatchObject({ bookedMinutes: 480, rate: 1, outsideMinutes: 0 });
		const over = utilisationReport(
			[entry("2026-11-09", "07:00", "17:00")],
			[works("2026-11-09", 480, 960)],
			[],
			range,
		);
		expect(over.practitioners[0]).toMatchObject({
			bookedMinutes: 480,
			outsideMinutes: 120,
			rate: 1,
		});
	});

	it("sums many days and many visits, and counts a no-show as booked but not a cancelled visit or a request", () => {
		const rows = [
			entry("2026-11-09", "09:00", "10:00"),
			entry("2026-11-10", "09:00", "10:30", { attendance: "absent" }),
			entry("2026-11-10", "11:00", "12:00", { status: "cancelled" }),
			entry("2026-11-11", "09:00", "10:00", { status: "requested" }),
		];
		const roster = ["2026-11-09", "2026-11-10", "2026-11-11"].map((d) => works(d, 480, 960));
		expect(utilisationReport(rows, roster, [], range).practitioners[0]).toMatchObject({
			availableMinutes: 1_440,
			bookedMinutes: 150,
		});
	});

	it("leave, a free day and a block take the available time away; a visit on them is outside", () => {
		const roster = [
			works("2026-11-09", 480, 960),
			off("2026-11-10", "annual_leave"),
			off("2026-11-11", "free"),
			works("2026-11-12", 480, 960),
		];
		const blocks: ReportBlock[] = [
			{
				person: { kind: "practitioner", id: "p1" },
				dateStart: "2026-11-12",
				dateEnd: "2026-11-12",
			},
		];
		const rows = [entry("2026-11-10", "09:00", "10:00"), entry("2026-11-12", "09:00", "10:00")];
		expect(utilisationReport(rows, roster, blocks, range).practitioners[0]).toMatchObject({
			availableMinutes: 480,
			bookedMinutes: 0,
			outsideMinutes: 120,
			rate: 0,
		});
	});

	it("a practitioner with no available time has a null rate, not zero or NaN", () => {
		const out = utilisationReport(
			[entry("2026-11-09", "09:00", "10:00")],
			[off("2026-11-09", "medical_leave")],
			[],
			range,
		);
		expect(out.practitioners[0]).toMatchObject({
			availableMinutes: 0,
			bookedMinutes: 0,
			outsideMinutes: 60,
			rate: null,
		});
	});

	it("a practitioner on the roster with no visits shows with zero booked", () => {
		const out = utilisationReport([], [works("2026-11-09", 480, 960, "p9")], [], range);
		expect(out.practitioners).toEqual([
			{ id: "p9", availableMinutes: 480, bookedMinutes: 0, outsideMinutes: 0, rate: 0 },
		]);
	});

	it("rooms and devices are available while any practitioner is: the union of their windows, counted once", () => {
		const roster = [
			works("2026-11-09", 480, 720, "p1"),
			works("2026-11-09", 600, 960, "p2"),
			works("2026-11-09", 0, 1_440, "r1", "staff"),
		];
		const rows = [
			entry("2026-11-09", "09:00", "10:00", { room: "room1" }),
			entry("2026-11-09", "09:00", "10:00", { device: "dev1", practitioner: "p2" }),
		];
		const out = utilisationReport(rows, roster, [], range);
		expect(out.rooms).toEqual([
			{ id: "room1", availableMinutes: 480, bookedMinutes: 60, outsideMinutes: 0, rate: 60 / 480 },
		]);
		expect(out.devices[0]).toMatchObject({ id: "dev1", availableMinutes: 480, bookedMinutes: 60 });
	});

	it("clips a visit to the range", () => {
		const r = days("2026-11-09", "2026-11-09");
		const out = utilisationReport(
			[{ ...entry("2026-11-09", "23:00", "23:59"), end: at("2026-11-10", "01:00") }],
			[works("2026-11-09", 0, 1_440)],
			[],
			r,
		);
		expect(out.practitioners[0]).toMatchObject({ bookedMinutes: 60, outsideMinutes: 0 });
	});

	it("sorts practitioners by id", () => {
		const out = utilisationReport(
			[],
			[works("2026-11-09", 480, 960, "b"), works("2026-11-09", 480, 960, "a")],
			[],
			range,
		);
		expect(out.practitioners.map((p) => p.id)).toEqual(["a", "b"]);
	});

	describe("daylight saving (Europe/Bucharest)", () => {
		it("a full-day window is 23 real hours on 2026-03-29 and 25 on 2026-10-25", () => {
			const spring = utilisationReport(
				[],
				[works("2026-03-29", 0, 1_440)],
				[],
				days("2026-03-29", "2026-03-29"),
			);
			expect(spring.practitioners[0]?.availableMinutes).toBe(23 * 60);
			const autumn = utilisationReport(
				[],
				[works("2026-10-25", 0, 1_440)],
				[],
				days("2026-10-25", "2026-10-25"),
			);
			expect(autumn.practitioners[0]?.availableMinutes).toBe(25 * 60);
		});

		it("an ordinary 08:00 to 16:00 window is 8 hours on both days, and a visit inside it books its real time", () => {
			for (const date of ["2026-03-29", "2026-10-25"]) {
				const out = utilisationReport(
					[entry(date, "09:00", "10:30")],
					[works(date, 480, 960)],
					[],
					days(date, date),
				);
				expect(out.practitioners[0], date).toMatchObject({
					availableMinutes: 480,
					bookedMinutes: 90,
					outsideMinutes: 0,
				});
			}
		});

		it("a night window across the jump: 00:00 to 06:00 is 5 real hours in March and 7 in October", () => {
			const spring = utilisationReport(
				[],
				[works("2026-03-29", 0, 360)],
				[],
				days("2026-03-29", "2026-03-29"),
			);
			expect(spring.practitioners[0]?.availableMinutes).toBe(5 * 60);
			const autumn = utilisationReport(
				[],
				[works("2026-10-25", 0, 360)],
				[],
				days("2026-10-25", "2026-10-25"),
			);
			expect(autumn.practitioners[0]?.availableMinutes).toBe(7 * 60);
		});

		it("a visit across the repeated hour books its real 60 minutes", () => {
			const start = Date.UTC(2026, 9, 25, 0, 30);
			const out = utilisationReport(
				[{ ...entry("2026-10-25", "03:30", "03:59"), start, end: start + 3_600_000 }],
				[works("2026-10-25", 0, 360)],
				[],
				days("2026-10-25", "2026-10-25"),
			);
			expect(out.practitioners[0]).toMatchObject({ bookedMinutes: 60, outsideMinutes: 0 });
		});
	});
});
