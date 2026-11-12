import { describe, expect, it } from "vitest";
import { addDay, axisOf, mondayOf, place } from "./calendar-layout";

describe("the calendar's arithmetic", () => {
	it("puts overlapping events in their own lanes and lets a free event take the full width", () => {
		const placed = place([
			{ id: "a", start: 540, end: 600 },
			{ id: "b", start: 560, end: 620 },
			{ id: "c", start: 700, end: 760 },
		]);
		const by = Object.fromEntries(placed.map((p) => [p.id, p]));
		expect([by.a?.lane, by.a?.lanes, by.b?.lane, by.b?.lanes]).toEqual([0, 2, 1, 2]);
		expect([by.c?.lane, by.c?.lanes]).toEqual([0, 1]);
	});
	it("reuses a lane once its event has ended, and touching events do not overlap", () => {
		const placed = place([
			{ id: "a", start: 540, end: 600 },
			{ id: "b", start: 600, end: 660 },
		]);
		expect(placed.map((p) => [p.lane, p.lanes])).toEqual([
			[0, 1],
			[0, 1],
		]);
	});
	it("shows the working day and widens to hold an early or late event", () => {
		expect(axisOf([])).toEqual({ from: 480, to: 1200 });
		expect(axisOf([{ start: 400, end: 1290 }])).toEqual({ from: 360, to: 1320 });
		expect(axisOf([{ start: 0, end: 1500 }])).toEqual({ from: 0, to: 1440 });
	});
	it("finds a week's Monday and steps days across a month and a daylight-saving change", () => {
		expect(mondayOf("2026-11-12")).toBe("2026-11-09");
		expect(mondayOf("2026-11-15")).toBe("2026-11-09");
		expect(mondayOf("2026-11-09")).toBe("2026-11-09");
		expect(addDay("2026-11-30", 1)).toBe("2026-12-01");
		expect(addDay("2027-03-27", 1)).toBe("2027-03-28");
		expect(addDay("2027-03-28", 1)).toBe("2027-03-29");
	});
});
