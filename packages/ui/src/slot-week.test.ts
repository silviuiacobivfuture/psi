import { describe, expect, it } from "vitest";
import {
	addDays,
	distinctTimes,
	firstDayWithTimes,
	groupByPart,
	isLocalDate,
	localDate,
	localTime,
	mondayOf,
	type PickerSlot,
	partOfDay,
	weekCells,
} from "./slot-week";

const ZONE = "Europe/Bucharest";
const slot = (
	iso: string,
	practitioner = "p1",
	id = `${practitioner}.${Date.parse(iso)}.onsite`,
): PickerSlot => ({
	id,
	start: Date.parse(iso),
	practitioner,
	practitionerName: practitioner,
	mode: "onsite",
});

describe("local calendar arithmetic", () => {
	it("reads the wall clock of the practice's zone, daylight saving included", () => {
		// 2026-11-13 22:30Z is 00:30 on the 14th in Bucharest (UTC+2).
		expect(localDate(Date.parse("2026-11-13T22:30:00Z"), ZONE)).toBe("2026-11-14");
		expect(localTime(Date.parse("2026-11-13T22:30:00Z"), ZONE)).toBe("00:30");
		// In summer the offset is +3.
		expect(localTime(Date.parse("2026-07-01T07:00:00Z"), ZONE)).toBe("10:00");
	});
	it("finds the Monday of any day, across a month and a year", () => {
		expect(mondayOf("2026-11-12")).toBe("2026-11-09");
		expect(mondayOf("2026-11-15")).toBe("2026-11-09");
		expect(mondayOf("2026-11-09")).toBe("2026-11-09");
		expect(mondayOf("2027-01-01")).toBe("2026-12-28");
		expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
	});
	it("accepts real dates only", () => {
		expect(isLocalDate("2026-02-29")).toBe(false);
		expect(isLocalDate("2026-13-01")).toBe(false);
		expect(isLocalDate("2026-11-1")).toBe(false);
		expect(isLocalDate("2026-11-13")).toBe(true);
	});
	it("splits the day at 12:00 and 17:00", () => {
		expect(partOfDay("11:59")).toBe("morning");
		expect(partOfDay("12:00")).toBe("afternoon");
		expect(partOfDay("16:59")).toBe("afternoon");
		expect(partOfDay("17:00")).toBe("evening");
		expect(partOfDay("00:05")).toBe("morning");
	});
});

describe("the week", () => {
	const slots = [
		slot("2026-11-13T07:00:00Z"),
		slot("2026-11-13T07:00:00Z", "p2"),
		slot("2026-11-13T14:30:00Z"),
		slot("2026-11-11T08:00:00Z"),
	];
	it("counts distinct start times per day, marks today and greys the past", () => {
		const cells = weekCells("2026-11-09", slots, ZONE, "2026-11-12");
		expect(cells.map((c) => c.count)).toEqual([0, 0, 0, 0, 2, 0, 0]);
		expect(cells[3]?.today).toBe(true);
		expect(cells[2]?.past).toBe(true);
		expect(firstDayWithTimes(cells)).toBe("2026-11-13");
	});
	it("an empty week has no first day", () => {
		expect(firstDayWithTimes(weekCells("2026-11-16", [], ZONE, "2026-11-12"))).toBeUndefined();
	});
	it("two practitioners free at once are one time", () => {
		expect(distinctTimes(slots).length).toBe(3);
	});
	it("groups a day by part of the day, in order, leaving out empty parts", () => {
		const groups = groupByPart(
			[
				slot("2026-11-13T15:00:00Z"),
				slot("2026-11-13T07:00:00Z"),
				slot("2026-11-13T07:00:00Z", "p2"),
			],
			ZONE,
		);
		expect(groups.map((g) => g.part)).toEqual(["morning", "evening"]);
		expect(groups[0]?.slots.map((s) => s.time)).toEqual(["09:00"]);
		expect(groups[1]?.slots.map((s) => s.time)).toEqual(["17:00"]);
	});
});
