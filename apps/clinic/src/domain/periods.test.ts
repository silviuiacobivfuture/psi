import { describe, expect, it } from "vitest";
import { clamp, MAX_SPAN_DAYS, previousOf, StatsQuerySchema, spanOf } from "./periods";

const TODAY = "2026-11-18"; // a Wednesday
const q = (period: Parameters<typeof spanOf>[0]["period"], from?: string, to?: string) => ({
	period,
	...(from === undefined ? {} : { from }),
	...(to === undefined ? {} : { to }),
});

describe("the period a statistics screen shows", () => {
	it("names today, this week (Monday to Sunday), this and last calendar month, the last 30 days", () => {
		expect(spanOf(q("today"), TODAY)).toEqual({ from: TODAY, to: TODAY });
		expect(spanOf(q("week"), TODAY)).toEqual({ from: "2026-11-16", to: "2026-11-22" });
		expect(spanOf(q("month"), TODAY)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
		expect(spanOf(q("last-month"), TODAY)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
		expect(spanOf(q("last-30"), TODAY)).toEqual({ from: "2026-10-20", to: TODAY });
	});
	it("handles a month at a year's edge and a February", () => {
		expect(spanOf(q("last-month"), "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
		expect(spanOf(q("month"), "2028-02-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
	});
	it("a custom period puts a reversed range right and a missing end is the one day it has", () => {
		expect(spanOf(q("custom", "2026-11-10", "2026-11-03"), TODAY)).toEqual({
			from: "2026-11-03",
			to: "2026-11-10",
		});
		expect(spanOf(q("custom", "2026-11-10"), TODAY)).toEqual({
			from: "2026-11-10",
			to: "2026-11-10",
		});
		expect(spanOf(q("custom"), TODAY)).toEqual({ from: TODAY, to: TODAY });
	});
	it("compares a whole month with the month before, anything else with the same days just before", () => {
		expect(previousOf({ from: "2026-11-01", to: "2026-11-30" })).toEqual({
			from: "2026-10-01",
			to: "2026-10-31",
		});
		expect(previousOf({ from: "2026-03-01", to: "2026-03-31" })).toEqual({
			from: "2026-02-01",
			to: "2026-02-28",
		});
		expect(previousOf({ from: "2026-11-16", to: "2026-11-22" })).toEqual({
			from: "2026-11-09",
			to: "2026-11-15",
		});
		expect(previousOf({ from: TODAY, to: TODAY })).toEqual({
			from: "2026-11-17",
			to: "2026-11-17",
		});
	});
	it("cuts a period longer than a year to a year, from its start, and leaves a year alone", () => {
		const long = clamp({ from: "2020-01-01", to: "2026-01-01" });
		expect(long.from).toBe("2020-01-01");
		expect(long.to).toBe("2020-12-31");
		const year = { from: "2026-01-01", to: "2026-12-31" };
		expect(clamp(year)).toEqual(year);
		expect(MAX_SPAN_DAYS).toBe(366);
	});
	it("reads the URL: a comparison is on unless it says 0; an unknown period or a bad day is refused", () => {
		expect(StatsQuerySchema.parse({}).compare).toBe("1");
		expect(StatsQuerySchema.parse({ compare: "0" }).compare).toBe("0");
		expect(StatsQuerySchema.parse({ period: "" }).period).toBe("month");
		expect(StatsQuerySchema.safeParse({ period: "decade" }).success).toBe(false);
		expect(StatsQuerySchema.safeParse({ from: "13/11/2026" }).success).toBe(false);
	});
});
