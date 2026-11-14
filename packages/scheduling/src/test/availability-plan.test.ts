import { describe, expect, it } from "vitest";
import {
	AVAILABILITY_LIMITS,
	entryDates,
	entryRows,
	oneOffProblems,
	weeklyPlanProblems,
} from "../domain/availability";
import type { DayException, WeeklyRule } from "../domain/catalog";
import { parseClock } from "../domain/time";

const ZONE = "Europe/Bucharest";
const rule = (
	weekday: number,
	start: string,
	end: string,
	extra: Partial<WeeklyRule> = {},
): WeeklyRule => ({
	weekday,
	start: parseClock(start),
	end: parseClock(end),
	modes: ["onsite", "online"],
	...extra,
});
const reasons = (rules: WeeklyRule[]) => weeklyPlanProblems(rules).map((p) => p.reason);

describe("weeklyPlanProblems", () => {
	it("accepts an empty plan, one rule, and a split day (09:00-13:00 and 15:00-19:00)", () => {
		expect(weeklyPlanProblems([])).toEqual([]);
		expect(weeklyPlanProblems([rule(1, "09:00", "17:00")])).toEqual([]);
		expect(weeklyPlanProblems([rule(1, "09:00", "13:00"), rule(1, "15:00", "19:00")])).toEqual([]);
	});

	it("accepts back-to-back intervals (an end equal to the next start is no overlap)", () => {
		expect(weeklyPlanProblems([rule(2, "09:00", "13:00"), rule(2, "13:00", "17:00")])).toEqual([]);
	});

	it("accepts a window ending at midnight (24:00)", () => {
		expect(weeklyPlanProblems([rule(5, "18:00", "24:00")])).toEqual([]);
	});

	it("refuses an end before or equal to the start", () => {
		expect(reasons([rule(1, "13:00", "09:00")])).toEqual(["end_before_start"]);
		expect(reasons([rule(1, "09:00", "09:00")])).toEqual(["end_before_start"]);
	});

	it("refuses times outside the day and weekdays outside 1..7", () => {
		expect(reasons([{ ...rule(1, "09:00", "10:00"), end: 1441 }])).toEqual(["out_of_day"]);
		expect(reasons([{ ...rule(1, "09:00", "10:00"), start: -5 }])).toEqual(["out_of_day"]);
		expect(reasons([rule(0, "09:00", "10:00")])).toEqual(["weekday"]);
		expect(reasons([rule(8, "09:00", "10:00")])).toEqual(["weekday"]);
	});

	it("refuses times off the five-minute grid", () => {
		expect(reasons([rule(1, "09:03", "10:00")])).toEqual(["grid"]);
	});

	it("refuses a rule with no mode, a bad date, until before from, a period without its start", () => {
		expect(reasons([{ ...rule(1, "09:00", "10:00"), modes: [] }])).toEqual(["no_mode"]);
		expect(reasons([rule(1, "09:00", "10:00", { validFrom: "2026-02-30" })])).toEqual(["bad_date"]);
		expect(
			reasons([rule(1, "09:00", "10:00", { validFrom: "2026-12-01", validUntil: "2026-11-01" })]),
		).toEqual(["validity"]);
		expect(reasons([rule(1, "09:00", "10:00", { override: true })])).toEqual(["period_start"]);
	});

	it("names both rules of an overlap, the later one first", () => {
		expect(weeklyPlanProblems([rule(3, "09:00", "13:00"), rule(3, "12:00", "15:00")])).toEqual([
			{ reason: "overlap", index: 1, other: 0 },
		]);
	});

	it("does not call rules on different weekdays, disjoint dates or other weeks an overlap", () => {
		expect(weeklyPlanProblems([rule(3, "09:00", "13:00"), rule(4, "09:00", "13:00")])).toEqual([]);
		expect(
			weeklyPlanProblems([
				rule(3, "09:00", "13:00", { validUntil: "2026-12-31" }),
				rule(3, "09:00", "13:00", { validFrom: "2027-01-01" }),
			]),
		).toEqual([]);
		expect(
			weeklyPlanProblems([
				rule(3, "09:00", "13:00", { week: "A" }),
				rule(3, "09:00", "13:00", { week: "B" }),
			]),
		).toEqual([]);
	});

	it("calls an every-week rule and a week-A rule on the same hours an overlap", () => {
		expect(reasons([rule(3, "09:00", "13:00"), rule(3, "10:00", "11:00", { week: "A" })])).toEqual([
			"overlap",
		]);
	});

	it("does not compare a period schedule with the regular week it replaces", () => {
		expect(
			weeklyPlanProblems([
				rule(1, "09:00", "17:00"),
				rule(1, "10:00", "12:00", { override: true, validFrom: "2027-07-01" }),
			]),
		).toEqual([]);
	});

	it("counts the intervals of one day: six pass, the seventh is refused", () => {
		const six = [0, 1, 2, 3, 4, 5].map((h) =>
			rule(
				1,
				`${String(8 + h * 2).padStart(2, "0")}:00`,
				`${String(9 + h * 2).padStart(2, "0")}:00`,
			),
		);
		expect(weeklyPlanProblems(six)).toEqual([]);
		expect(reasons([...six, rule(1, "21:00", "21:30")])).toEqual(["too_many_intervals"]);
	});

	it("refuses more rules than the limit, and accepts exactly the limit", () => {
		const one = (i: number) =>
			rule((i % 7) + 1, "00:00", "00:05", {
				validFrom: `2027-01-${String((i % 28) + 1).padStart(2, "0")}`,
				validUntil: `2027-01-${String((i % 28) + 1).padStart(2, "0")}`,
			});
		const many = Array.from({ length: AVAILABILITY_LIMITS.rules + 1 }, (_, i) => one(i));
		expect(reasons(many)).toEqual(["too_many"]);
	});
});

describe("oneOffProblems", () => {
	const closedDay = (date: string): DayException => ({ date, kind: "closed" });

	it("accepts a whole closed day, a part of a day, a range and extra hours", () => {
		expect(oneOffProblems({ from: "2026-12-24", kind: "closed" }, [], ZONE)).toEqual([]);
		expect(
			oneOffProblems({ from: "2026-12-24", kind: "closed", start: 720, end: 1080 }, [], ZONE),
		).toEqual([]);
		expect(
			oneOffProblems({ from: "2026-12-24", until: "2027-01-02", kind: "closed" }, [], ZONE),
		).toEqual([]);
		expect(
			oneOffProblems({ from: "2026-12-19", kind: "open", start: 600, end: 840 }, [], ZONE),
		).toEqual([]);
	});

	it("refuses a bad date, a range that ends before it starts, and one longer than the limit", () => {
		expect(oneOffProblems({ from: "2026-13-01", kind: "closed" }, [], ZONE)).toEqual([
			{ reason: "bad_date" },
		]);
		expect(
			oneOffProblems({ from: "2026-12-24", until: "2026-12-20", kind: "closed" }, [], ZONE),
		).toEqual([{ reason: "range_order" }]);
		expect(
			oneOffProblems({ from: "2026-01-01", until: "2026-12-31", kind: "closed" }, [], ZONE),
		).toEqual([{ reason: "range_too_long" }]);
	});

	it("refuses one time without the other, extra hours without hours, and hours the wrong way", () => {
		expect(oneOffProblems({ from: "2026-12-24", kind: "closed", start: 600 }, [], ZONE)).toEqual([
			{ reason: "times_pair" },
		]);
		expect(oneOffProblems({ from: "2026-12-24", kind: "open" }, [], ZONE)).toEqual([
			{ reason: "open_needs_hours" },
		]);
		expect(
			oneOffProblems({ from: "2026-12-24", kind: "open", start: 900, end: 600 }, [], ZONE),
		).toEqual([{ reason: "end_before_start" }]);
		expect(
			oneOffProblems({ from: "2026-12-24", kind: "open", start: 601, end: 900 }, [], ZONE),
		).toEqual([{ reason: "grid" }]);
		expect(
			oneOffProblems(
				{ from: "2026-12-24", kind: "open", start: 600, end: 900, modes: [] },
				[],
				ZONE,
			),
		).toEqual([{ reason: "no_mode" }]);
	});

	it("refuses an hour the spring change skips (03:00-04:00 on 2027-03-28 in Bucharest), not the day before", () => {
		expect(
			oneOffProblems({ from: "2027-03-28", kind: "open", start: 195, end: 300 }, [], ZONE),
		).toEqual([{ reason: "dst_gap", date: "2027-03-28" }]);
		expect(
			oneOffProblems({ from: "2027-03-27", kind: "open", start: 195, end: 300 }, [], ZONE),
		).toEqual([]);
	});

	it("accepts the repeated autumn hour (03:30 on 2026-10-25 exists twice, so it exists)", () => {
		expect(
			oneOffProblems({ from: "2026-10-25", kind: "closed", start: 210, end: 300 }, [], ZONE),
		).toEqual([]);
	});

	it("names each date of a range that clashes with what is there", () => {
		const existing = [closedDay("2026-12-25")];
		expect(
			oneOffProblems({ from: "2026-12-24", until: "2026-12-26", kind: "closed" }, existing, ZONE),
		).toEqual([{ reason: "duplicate", date: "2026-12-25" }]);
		expect(
			oneOffProblems({ from: "2026-12-25", kind: "open", start: 600, end: 700 }, existing, ZONE),
		).toEqual([{ reason: "day_closed", date: "2026-12-25" }]);
	});

	it("refuses overlapping extra hours on one date, and lets back-to-back ones through", () => {
		const existing: DayException[] = [{ date: "2026-12-19", kind: "open", start: 600, end: 720 }];
		expect(
			oneOffProblems({ from: "2026-12-19", kind: "open", start: 700, end: 800 }, existing, ZONE),
		).toEqual([{ reason: "overlap", date: "2026-12-19" }]);
		expect(
			oneOffProblems({ from: "2026-12-19", kind: "open", start: 720, end: 800 }, existing, ZONE),
		).toEqual([]);
		expect(
			oneOffProblems({ from: "2026-12-19", kind: "open", start: 600, end: 720 }, existing, ZONE),
		).toEqual([{ reason: "duplicate", date: "2026-12-19" }]);
	});

	it("refuses an entry that would pass the number of rows kept", () => {
		const existing = Array.from({ length: AVAILABILITY_LIMITS.exceptions }, (_, i) =>
			closedDay(`2030-01-${String((i % 28) + 1).padStart(2, "0")}`),
		);
		expect(oneOffProblems({ from: "2026-12-24", kind: "closed" }, existing, ZONE)).toEqual([
			{ reason: "too_many" },
		]);
	});
});

describe("entryDates and entryRows", () => {
	it("walks calendar dates across the autumn change and a month end", () => {
		expect(entryDates({ from: "2026-10-24", until: "2026-10-26" })).toEqual([
			"2026-10-24",
			"2026-10-25",
			"2026-10-26",
		]);
		expect(entryDates({ from: "2027-02-27", until: "2027-03-01" })).toEqual([
			"2027-02-27",
			"2027-02-28",
			"2027-03-01",
		]);
		expect(entryDates({ from: "2026-12-24" })).toEqual(["2026-12-24"]);
	});

	it("makes one row per date, keeping modes only on extra hours", () => {
		expect(
			entryRows({ from: "2026-12-19", kind: "open", start: 600, end: 840, modes: ["onsite"] }),
		).toEqual([{ date: "2026-12-19", kind: "open", start: 600, end: 840, modes: ["onsite"] }]);
		expect(
			entryRows({ from: "2026-12-24", until: "2026-12-25", kind: "closed", modes: ["onsite"] }),
		).toEqual([
			{ date: "2026-12-24", kind: "closed" },
			{ date: "2026-12-25", kind: "closed" },
		]);
	});
});
