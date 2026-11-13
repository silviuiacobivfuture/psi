import { describe, expect, it } from "vitest";
import { clientsReport } from "../clinic/reports/clients";
import { ratesByClient, ratesReport } from "../clinic/reports/rates";
import { at, days, entry } from "./reports-fixtures";

const range = days("2026-11-02", "2026-11-15");
const NOW = at("2026-11-16", "09:00");
const done = (date: string, over = {}) =>
	entry(date, "09:00", "10:00", { attendance: "attended", ...over });

describe("ratesReport", () => {
	it("has no rates for nothing (null, not zero or NaN)", () => {
		expect(ratesReport([], range, NOW)).toEqual({
			bookings: 0,
			cancelled: 0,
			cancellationRate: null,
			attended: 0,
			absent: 0,
			unmarked: 0,
			noShowRate: null,
		});
	});

	it("one attended visit is a booking with a no-show rate of 0, one absent has a rate of 1", () => {
		expect(ratesReport([done("2026-11-03")], range, NOW)).toMatchObject({
			bookings: 1,
			noShowRate: 0,
			cancellationRate: 0,
		});
		expect(ratesReport([done("2026-11-03", { attendance: "absent" })], range, NOW)).toMatchObject({
			absent: 1,
			noShowRate: 1,
		});
	});

	it("many: cancellation over bookings, no-show over known outcomes, unmarked apart", () => {
		const rows = [
			done("2026-11-03"),
			done("2026-11-04"),
			done("2026-11-05", { attendance: "absent" }),
			done("2026-11-06", { attendance: "pending" }),
			done("2026-11-09", { status: "cancelled" }),
			done("2026-11-10", { status: "cancelled" }),
		];
		expect(ratesReport(rows, range, NOW)).toEqual({
			bookings: 6,
			cancelled: 2,
			cancellationRate: 2 / 6,
			attended: 2,
			absent: 1,
			unmarked: 1,
			noShowRate: 1 / 3,
		});
	});

	it("holds, lapsed holds, waiting requests and declined requests are not bookings", () => {
		const rows = (["held", "expired", "requested", "declined"] as const).map((status) =>
			done("2026-11-03", { status }),
		);
		expect(ratesReport(rows, range, NOW).bookings).toBe(0);
	});

	it("a visit that has not ended yet has no outcome; one ending exactly now does", () => {
		const future = entry("2026-11-20", "09:00", "10:00", { start: NOW + 1, end: NOW + 3_600_000 });
		const justEnded = entry("2026-11-10", "09:00", "10:00", { end: NOW, attendance: "absent" });
		const wide = days("2026-11-02", "2026-11-30");
		expect(ratesReport([future], wide, NOW)).toMatchObject({
			bookings: 1,
			attended: 0,
			absent: 0,
			unmarked: 0,
		});
		expect(ratesReport([justEnded], wide, NOW)).toMatchObject({ absent: 1 });
	});

	it("web bookings count in cancellations, never in attendance", () => {
		const rows = [
			done("2026-11-03", { source: "web", attendance: undefined }),
			done("2026-11-04", { source: "web", status: "cancelled", attendance: undefined }),
		];
		expect(ratesReport(rows, range, NOW)).toMatchObject({
			bookings: 2,
			cancelled: 1,
			attended: 0,
			absent: 0,
			unmarked: 0,
			noShowRate: null,
		});
	});

	it("filters, and only counts entries starting in the range", () => {
		const rows = [
			done("2026-11-03", { practitioner: "p1" }),
			done("2026-11-04", { practitioner: "p2" }),
			done("2026-10-30"),
			done("2026-11-16"),
		];
		expect(ratesReport(rows, range, NOW).bookings).toBe(2);
		expect(ratesReport(rows, range, NOW, { practitioner: "p2" }).bookings).toBe(1);
	});
});

describe("ratesByClient", () => {
	it("is empty for nothing and for entries that name no client", () => {
		expect(ratesByClient([], range, NOW)).toEqual([]);
		expect(ratesByClient([done("2026-11-03")], range, NOW)).toEqual([]);
	});

	it("lists the worst first: most no-shows, then most cancellations, then the id", () => {
		const rows = [
			done("2026-11-03", { client: "b", attendance: "absent" }),
			done("2026-11-04", { client: "a" }),
			done("2026-11-05", { client: "c", attendance: "absent" }),
			done("2026-11-06", { client: "c", attendance: "absent" }),
			done("2026-11-09", { client: "d", status: "cancelled" }),
			done("2026-11-10", { client: "d", status: "cancelled" }),
		];
		const out = ratesByClient(rows, range, NOW);
		expect(out.map((c) => c.client)).toEqual(["c", "b", "d", "a"]);
		expect(out[0]).toEqual({
			client: "c",
			bookings: 2,
			cancelled: 0,
			attended: 0,
			absent: 2,
			cancellationRate: 0,
			noShowRate: 1,
		});
		expect(out[2]).toMatchObject({ client: "d", cancellationRate: 1, noShowRate: null });
	});

	it("leaves out clients below the minimum number of bookings, boundary included", () => {
		const rows = [
			done("2026-11-03", { client: "a" }),
			done("2026-11-04", { client: "a" }),
			done("2026-11-05", { client: "b" }),
		];
		expect(ratesByClient(rows, range, NOW, { minBookings: 2 }).map((c) => c.client)).toEqual(["a"]);
		expect(ratesByClient(rows, range, NOW, { minBookings: 3 })).toEqual([]);
		expect(ratesByClient(rows, range, NOW, { minBookings: 1 })).toHaveLength(2);
	});
});

describe("clientsReport: new against returning", () => {
	const confirmed = (date: string, client: string, over = {}) =>
		entry(date, "09:00", "10:00", { client, ...over });

	it("is zero for nothing", () => {
		expect(clientsReport([], new Set(), days("2026-11-02", "2026-11-08"), "day")).toMatchObject({
			active: 0,
			new: 0,
			returning: 0,
		});
	});

	it("a client with no earlier booking is new in the bucket of their first one, returning after", () => {
		const rows = [
			confirmed("2026-11-02", "a"),
			confirmed("2026-11-04", "a"),
			confirmed("2026-11-10", "a"),
		];
		const out = clientsReport(rows, new Set(), days("2026-11-02", "2026-11-15"), "week");
		expect(out).toMatchObject({ active: 1, new: 1, returning: 0 });
		expect(out.buckets).toEqual([
			{ bucket: "2026-11-02", new: 1, returning: 0 },
			{ bucket: "2026-11-09", new: 0, returning: 1 },
		]);
	});

	it("a client from before the range is returning everywhere", () => {
		const out = clientsReport(
			[confirmed("2026-11-02", "a"), confirmed("2026-11-10", "a")],
			new Set(["a"]),
			days("2026-11-02", "2026-11-15"),
			"week",
		);
		expect(out).toMatchObject({ active: 1, new: 0, returning: 1 });
		expect(out.buckets.map((b) => [b.new, b.returning])).toEqual([
			[0, 1],
			[0, 1],
		]);
	});

	it("counts a client once per bucket, however many visits, and many clients together", () => {
		const rows = [
			confirmed("2026-11-02", "a"),
			confirmed("2026-11-02", "a"),
			confirmed("2026-11-03", "b"),
			confirmed("2026-11-03", "c"),
		];
		const out = clientsReport(rows, new Set(["c"]), days("2026-11-02", "2026-11-08"), "day");
		expect(out).toMatchObject({ active: 3, new: 2, returning: 1 });
		expect(out.buckets.find((b) => b.bucket === "2026-11-02")).toEqual({
			bucket: "2026-11-02",
			new: 1,
			returning: 0,
		});
		expect(out.buckets.find((b) => b.bucket === "2026-11-03")).toEqual({
			bucket: "2026-11-03",
			new: 1,
			returning: 1,
		});
	});

	it("only confirmed entries naming a client count; the input order does not matter", () => {
		const rows = [
			confirmed("2026-11-10", "a"),
			confirmed("2026-11-02", "a"),
			confirmed("2026-11-03", "z", { status: "cancelled" }),
			confirmed("2026-11-03", "y", { status: "requested" }),
			entry("2026-11-03", "09:00", "10:00"),
		];
		const out = clientsReport(rows, new Set(), days("2026-11-02", "2026-11-15"), "week");
		expect(out).toMatchObject({ active: 1, new: 1 });
		expect(out.buckets).toEqual([
			{ bucket: "2026-11-02", new: 1, returning: 0 },
			{ bucket: "2026-11-09", new: 0, returning: 1 },
		]);
	});
});
