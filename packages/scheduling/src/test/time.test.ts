import { describe, expect, it } from "vitest";
import {
	addDays,
	formatClock,
	isLocalDate,
	offsetMinutes,
	parseClock,
	resolveLocal,
	startOfLocalDay,
	toLocal,
	weekdayOf,
} from "../domain/time";

const ZONE = "Europe/Bucharest";

/** The wall clock Intl itself reads for an instant: the oracle the module is checked against. */
function intlWall(instant: number): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: ZONE,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	}).formatToParts(new Date(instant));
	const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
	return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

describe("time in Europe/Bucharest", () => {
	it("reads the offset Intl reads, on both sides of both changes", () => {
		for (const iso of [
			"2026-01-15T10:00:00Z",
			"2026-03-29T00:59:00Z",
			"2026-03-29T01:00:00Z",
			"2026-07-01T10:00:00Z",
			"2026-10-25T00:59:00Z",
			"2026-10-25T01:00:00Z",
		]) {
			const instant = Date.parse(iso);
			const local = toLocal(instant, ZONE);
			expect(`${local.date} ${formatClock(local.minutes)}`).toBe(intlWall(instant));
			expect(instant + offsetMinutes(instant, ZONE) * 60_000).toBe(
				Date.parse(`${local.date}T${formatClock(local.minutes)}:${iso.slice(17, 19)}Z`),
			);
		}
	});

	it("finds the spring gap: 03:00 to 03:59 on 29 March 2026 does not exist", () => {
		expect(resolveLocal("2026-03-29", parseClock("03:00"), ZONE)).toEqual({ kind: "gap" });
		expect(resolveLocal("2026-03-29", parseClock("03:59"), ZONE)).toEqual({ kind: "gap" });
		const before = resolveLocal("2026-03-29", parseClock("02:59"), ZONE);
		const after = resolveLocal("2026-03-29", parseClock("04:00"), ZONE);
		expect(before.kind).toBe("exact");
		expect(after.kind).toBe("exact");
		if (before.kind === "exact" && after.kind === "exact") {
			expect(after.instant - before.instant).toBe(60_000);
			expect(intlWall(after.instant)).toBe("2026-03-29 04:00");
		}
	});

	it("finds the autumn repeat: 03:30 on 25 October 2026 happens twice, an hour apart", () => {
		const resolved = resolveLocal("2026-10-25", parseClock("03:30"), ZONE);
		expect(resolved.kind).toBe("ambiguous");
		if (resolved.kind === "ambiguous") {
			expect(resolved.later - resolved.earlier).toBe(3_600_000);
			expect(intlWall(resolved.earlier)).toBe("2026-10-25 03:30");
			expect(intlWall(resolved.later)).toBe("2026-10-25 03:30");
			expect(offsetMinutes(resolved.earlier, ZONE)).toBe(
				offsetMinutes(Date.parse("2026-07-01"), ZONE),
			);
			expect(offsetMinutes(resolved.later, ZONE)).toBe(
				offsetMinutes(Date.parse("2026-01-01"), ZONE),
			);
		}
	});

	it("resolves an ordinary wall time exactly, and round-trips it", () => {
		const resolved = resolveLocal("2026-11-18", parseClock("10:15"), ZONE);
		expect(resolved.kind).toBe("exact");
		if (resolved.kind === "exact") expect(intlWall(resolved.instant)).toBe("2026-11-18 10:15");
	});

	it("days are 23, 24 and 25 hours long around the changes", () => {
		const length = (date: string): number =>
			(startOfLocalDay(addDays(date, 1), ZONE) - startOfLocalDay(date, ZONE)) / 3_600_000;
		expect(length("2026-03-29")).toBe(23);
		expect(length("2026-06-10")).toBe(24);
		expect(length("2026-10-25")).toBe(25);
	});

	it("does calendar arithmetic and validation", () => {
		expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
		expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
		expect(weekdayOf("2026-03-29")).toBe(7);
		expect(weekdayOf("2026-11-16")).toBe(1);
		expect(isLocalDate("2026-02-30")).toBe(false);
		expect(isLocalDate("2026-2-3")).toBe(false);
		expect(parseClock("24:00")).toBe(1440);
		expect(() => parseClock("24:30")).toThrow();
		expect(() => resolveLocal("2026-01-01", 1440, ZONE)).toThrow();
	});
});
