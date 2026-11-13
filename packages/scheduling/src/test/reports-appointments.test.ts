import { describe, expect, it } from "vitest";
import { appointmentsReport } from "../clinic/reports/appointments";
import {
	bucketOf,
	bucketOfDate,
	bucketsOf,
	datesOf,
	instantAt,
	overlapMinutes,
	rangeProblem,
} from "../clinic/reports/buckets";
import { at, days, entry, HOUR, MIN, ZONE } from "./reports-fixtures";

describe("buckets", () => {
	it("a day is its local date, a week its Monday, a month YYYY-MM", () => {
		expect(bucketOfDate("2026-11-13", "day")).toBe("2026-11-13");
		expect(bucketOfDate("2026-11-13", "week")).toBe("2026-11-09");
		expect(bucketOfDate("2026-11-09", "week")).toBe("2026-11-09");
		expect(bucketOfDate("2026-11-15", "week")).toBe("2026-11-09");
		expect(bucketOfDate("2026-11-13", "month")).toBe("2026-11");
	});

	it("a week crosses a month and a year boundary by its Monday", () => {
		expect(bucketOfDate("2027-01-01", "week")).toBe("2026-12-28");
		expect(bucketOfDate("2026-03-01", "week")).toBe("2026-02-23");
	});

	it("an instant belongs to its LOCAL date, not the UTC one", () => {
		// 00:30 local on 2026-03-30 is 21:30 UTC on 2026-03-29 (UTC+3 after the change).
		const t = at("2026-03-30", "00:30");
		expect(new Date(t).toISOString().slice(0, 10)).toBe("2026-03-29");
		expect(bucketOf(t, ZONE, "day")).toBe("2026-03-30");
		expect(bucketOf(t, ZONE, "week")).toBe("2026-03-30");
		const late = at("2026-03-29", "23:30");
		expect(bucketOf(late, ZONE, "week")).toBe("2026-03-23");
	});

	it("month ends are local: 23:59 on the 31st and 00:00 on the 1st", () => {
		expect(bucketOf(at("2026-10-31", "23:59"), ZONE, "month")).toBe("2026-10");
		expect(bucketOf(at("2026-11-01", "00:00"), ZONE, "month")).toBe("2026-11");
	});

	it("lists every bucket of a range, in order, including empty ones", () => {
		const r = days("2026-03-25", "2026-04-02");
		expect(bucketsOf(r, "week")).toEqual(["2026-03-23", "2026-03-30"]);
		expect(bucketsOf(r, "month")).toEqual(["2026-03", "2026-04"]);
		expect(bucketsOf(r, "day")).toHaveLength(9);
	});

	it("the daylight saving days are one day each, in the date list", () => {
		expect(datesOf(days("2026-03-28", "2026-03-30"))).toEqual([
			"2026-03-28",
			"2026-03-29",
			"2026-03-30",
		]);
		expect(datesOf(days("2026-10-24", "2026-10-26"))).toEqual([
			"2026-10-24",
			"2026-10-25",
			"2026-10-26",
		]);
	});

	it("refuses an empty, reversed, non-finite or too long range; a year and a day is the longest", () => {
		const r = days("2026-01-01", "2026-01-10");
		expect(rangeProblem({ ...r, to: r.from })).toBe("invalid_range");
		expect(rangeProblem({ ...r, to: r.from - 1 })).toBe("invalid_range");
		expect(rangeProblem({ ...r, to: Number.NaN })).toBe("invalid_range");
		expect(rangeProblem(days("2026-01-01", "2026-12-31"))).toBeUndefined();
		expect(rangeProblem(days("2026-01-01", "2027-01-01"))).toBeUndefined();
		expect(rangeProblem(days("2026-01-01", "2027-01-02"))).toBe("range_too_long");
		expect(rangeProblem(days("2026-03-29", "2026-03-29"))).toBeUndefined();
	});

	it("instantAt: 24:00 is the next midnight; a skipped time is the first instant after the gap; a repeated time is the first", () => {
		expect(instantAt("2026-11-13", 1_440, ZONE)).toBe(at("2026-11-14", "00:00"));
		// 03:30 on 2026-03-29 does not exist: the clocks jump from 03:00 to 04:00.
		expect(instantAt("2026-03-29", 210, ZONE)).toBe(at("2026-03-29", "04:00"));
		// 03:30 on 2026-10-25 happens twice; the first is 00:30 UTC.
		expect(instantAt("2026-10-25", 210, ZONE)).toBe(Date.UTC(2026, 9, 25, 0, 30));
	});

	it("overlapMinutes clips to the window and is never negative", () => {
		expect(overlapMinutes(0, 60 * MIN, 30 * MIN, 120 * MIN)).toBe(30);
		expect(overlapMinutes(0, 10 * MIN, 20 * MIN, 30 * MIN)).toBe(0);
		expect(overlapMinutes(0, 10 * MIN, 10 * MIN, 30 * MIN)).toBe(0);
	});
});

describe("appointmentsReport", () => {
	const range = days("2026-11-09", "2026-11-15");

	it("is zero in every bucket for nothing", () => {
		const out = appointmentsReport([], range, "day", "status");
		expect(out.total).toBe(0);
		expect(out.by).toEqual({});
		expect(out.buckets).toHaveLength(7);
		expect(out.buckets.every((b) => b.total === 0)).toBe(true);
	});

	it("counts one entry in its day, and by its status", () => {
		const out = appointmentsReport([entry("2026-11-10", "09:00", "10:00")], range, "day", "status");
		expect(out.total).toBe(1);
		expect(out.by).toEqual({ confirmed: 1 });
		expect(out.buckets.find((b) => b.bucket === "2026-11-10")).toEqual({
			bucket: "2026-11-10",
			total: 1,
			by: { confirmed: 1 },
		});
	});

	it("counts many by status, service, practitioner, room and device, per day, week and month", () => {
		const rows = [
			entry("2026-11-09", "09:00", "10:00", { service: "ABA", practitioner: "p1", room: "r1" }),
			entry("2026-11-09", "10:00", "11:00", { service: "ABA", practitioner: "p2", device: "d1" }),
			entry("2026-11-11", "09:00", "10:00", {
				service: "NFB",
				practitioner: "p1",
				status: "cancelled",
			}),
			entry("2026-11-14", "09:00", "10:00", {
				service: "NFB",
				practitioner: "p1",
				source: "web",
				status: "requested",
			}),
		];
		expect(appointmentsReport(rows, range, "week", "status").by).toEqual({
			cancelled: 1,
			confirmed: 2,
			requested: 1,
		});
		expect(appointmentsReport(rows, range, "week", "service").by).toEqual({ ABA: 2, NFB: 2 });
		expect(appointmentsReport(rows, range, "month", "practitioner").by).toEqual({ p1: 3, p2: 1 });
		expect(appointmentsReport(rows, range, "day", "room").by).toEqual({ none: 3, r1: 1 });
		expect(appointmentsReport(rows, range, "day", "device").by).toEqual({ d1: 1, none: 3 });
		const week = appointmentsReport(rows, range, "week", "service");
		expect(week.buckets).toEqual([{ bucket: "2026-11-09", total: 4, by: { ABA: 2, NFB: 2 } }]);
	});

	it("leaves out holds and lapsed holds by default, and shows them when asked for", () => {
		const rows = [
			entry("2026-11-10", "09:00", "10:00", { status: "held" }),
			entry("2026-11-10", "10:00", "11:00", { status: "expired" }),
			entry("2026-11-10", "11:00", "12:00", { status: "declined" }),
		];
		expect(appointmentsReport(rows, range, "day", "status").by).toEqual({ declined: 1 });
		expect(
			appointmentsReport(rows, range, "day", "status", { statuses: ["held", "expired"] }).by,
		).toEqual({ expired: 1, held: 1 });
	});

	it("filters by practitioner, room, device, service, client and source, together", () => {
		const rows = [
			entry("2026-11-10", "09:00", "10:00", { practitioner: "p1", room: "r1", client: "c1" }),
			entry("2026-11-10", "10:00", "11:00", { practitioner: "p1", room: "r2", client: "c1" }),
			entry("2026-11-10", "11:00", "12:00", {
				practitioner: "p2",
				room: "r1",
				client: "c2",
				service: "NFB",
				source: "web",
			}),
		];
		const count = (filter: Parameters<typeof appointmentsReport>[4]) =>
			appointmentsReport(rows, range, "day", "status", filter).total;
		expect(count({ practitioner: "p1" })).toBe(2);
		expect(count({ room: "r1" })).toBe(2);
		expect(count({ client: "c2" })).toBe(1);
		expect(count({ service: "NFB" })).toBe(1);
		expect(count({ source: "web" })).toBe(1);
		expect(count({ practitioner: "p1", room: "r1" })).toBe(1);
		expect(count({ practitioner: "nobody" })).toBe(0);
	});

	it("range edges: the first instant is in, the instant `to` is out", () => {
		const rows = [
			{ ...entry("2026-11-09", "00:00", "01:00") },
			{ ...entry("2026-11-15", "23:59", "23:59"), start: range.to - 1 },
			{ ...entry("2026-11-16", "00:00", "01:00"), start: range.to },
			{ ...entry("2026-11-08", "23:00", "23:59"), start: range.from - 1 },
		];
		expect(appointmentsReport(rows, range, "day", "status").total).toBe(2);
	});

	it("an entry at 00:30 local falls in its local day even when UTC says the day before", () => {
		const r = days("2026-03-29", "2026-03-30");
		const out = appointmentsReport([entry("2026-03-30", "00:30", "01:00")], r, "day", "status");
		expect(out.buckets.map((b) => [b.bucket, b.total])).toEqual([
			["2026-03-29", 0],
			["2026-03-30", 1],
		]);
	});

	it("the 25-hour day (2026-10-25) is one bucket, and the 23-hour day (2026-03-29) too", () => {
		const autumn = days("2026-10-24", "2026-10-26");
		const out = appointmentsReport(
			[entry("2026-10-25", "00:30", "01:00"), entry("2026-10-25", "23:30", "23:59")],
			autumn,
			"day",
			"status",
		);
		expect(out.buckets.map((b) => b.total)).toEqual([0, 2, 0]);
		const spring = days("2026-03-28", "2026-03-30");
		const s = appointmentsReport(
			[entry("2026-03-29", "00:30", "01:00"), entry("2026-03-29", "23:30", "23:59")],
			spring,
			"day",
			"status",
		);
		expect(s.buckets.map((b) => b.total)).toEqual([0, 2, 0]);
	});

	it("is deterministic: the same rows in another order give the same report", () => {
		const rows = [
			entry("2026-11-10", "09:00", "10:00", { service: "B" }),
			entry("2026-11-11", "09:00", "10:00", { service: "A" }),
		];
		expect(appointmentsReport([...rows].reverse(), range, "day", "service")).toEqual(
			appointmentsReport(rows, range, "day", "service"),
		);
	});

	it("does not change its input", () => {
		const rows = [entry("2026-11-10", "09:00", "10:00")];
		const copy = structuredClone(rows);
		appointmentsReport(rows, range, "week", "status");
		expect(rows).toEqual(copy);
		expect(HOUR).toBe(3_600_000);
	});
});
