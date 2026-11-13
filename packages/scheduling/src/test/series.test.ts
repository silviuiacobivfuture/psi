import { describe, expect, it } from "vitest";
import { atWallTime, MAX_SERIES, weeklyOccurrences } from "../clinic/series";
import { resolveLocal, toLocal } from "../domain/time";

const ZONE = "Europe/Bucharest";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** The instant a local wall time names, which must exist and be unambiguous for the fixtures below. */
function at(date: string, minutes: number): number {
	const r = resolveLocal(date, minutes, ZONE);
	if (r.kind !== "exact") throw new Error(`fixture: ${date} ${minutes} is ${r.kind}`);
	return r.instant;
}
const wall = (instant: number) => toLocal(instant, ZONE);

describe("a weekly series keeps the wall-clock time", () => {
	it("across the spring change (2026-03-29): the same 10:00, a week less an hour apart", () => {
		const start = at("2026-03-22", 600);
		const out = weeklyOccurrences({ start, end: start + HOUR }, { count: 3 }, ZONE);
		if (!out.ok) throw new Error("expected occurrences");
		expect(out.occurrences.map((o) => wall(o.start))).toEqual([
			{ date: "2026-03-22", minutes: 600, weekday: 7 },
			{ date: "2026-03-29", minutes: 600, weekday: 7 },
			{ date: "2026-04-05", minutes: 600, weekday: 7 },
		]);
		const [a, b, c] = out.occurrences.map((o) => o.start);
		expect((b ?? 0) - (a ?? 0)).toBe(7 * DAY - HOUR);
		expect((c ?? 0) - (b ?? 0)).toBe(7 * DAY);
		// The duration is elapsed time, whatever the clocks did.
		for (const o of out.occurrences) expect(o.end - o.start).toBe(HOUR);
	});

	it("across the autumn change (2026-10-25): the same 10:00, a week plus an hour apart", () => {
		const start = at("2026-10-18", 600);
		const out = weeklyOccurrences({ start, end: start + HOUR }, { count: 2 }, ZONE);
		if (!out.ok) throw new Error("expected occurrences");
		expect(out.occurrences.map((o) => wall(o.start).minutes)).toEqual([600, 600]);
		expect((out.occurrences[1]?.start ?? 0) - start).toBe(7 * DAY + HOUR);
	});

	it("a wall time that does not exist (03:30 on 2026-03-29) is refused, naming the occurrence, never moved", () => {
		const start = at("2026-03-22", 210);
		const out = weeklyOccurrences({ start, end: start + HOUR }, { count: 4 }, ZONE);
		expect(out).toEqual({
			ok: false,
			reason: "no_such_time",
			problems: [{ index: 1, date: "2026-03-29", reason: "no_such_time" }],
		});
	});

	it("a wall time that happens twice (03:30 on 2026-10-25) is taken at its first occurrence", () => {
		const start = at("2026-10-18", 210);
		const out = weeklyOccurrences({ start, end: start + HOUR }, { count: 2 }, ZONE);
		if (!out.ok) throw new Error("expected occurrences");
		const second = out.occurrences[1]?.start ?? 0;
		const r = resolveLocal("2026-10-25", 210, ZONE);
		expect(r.kind).toBe("ambiguous");
		if (r.kind === "ambiguous") expect(second).toBe(r.earlier);
	});

	it("ends after `count` occurrences, the first included, or on the last day that has one", () => {
		const start = at("2026-06-01", 540);
		const span = { start, end: start + HOUR };
		const n = weeklyOccurrences(span, { count: 5 }, ZONE);
		expect(n.ok && n.occurrences.map((o) => o.index)).toEqual([0, 1, 2, 3, 4]);
		const u = weeklyOccurrences(span, { until: "2026-06-22" }, ZONE);
		expect(u.ok && u.occurrences.map((o) => wall(o.start).date)).toEqual([
			"2026-06-01",
			"2026-06-08",
			"2026-06-15",
			"2026-06-22",
		]);
		const short = weeklyOccurrences(span, { until: "2026-06-21" }, ZONE);
		expect(short.ok && short.occurrences).toHaveLength(3);
	});

	it("holds the cap: 52 occurrences are accepted, 53 are too many, by count and by date", () => {
		const start = at("2026-06-01", 540);
		const span = { start, end: start + HOUR };
		const fifty2 = weeklyOccurrences(span, { count: MAX_SERIES }, ZONE);
		expect(fifty2.ok && fifty2.occurrences).toHaveLength(52);
		expect(weeklyOccurrences(span, { count: 53 }, ZONE)).toEqual({ ok: false, reason: "too_many" });
		// 52 weeks after the first is the 53rd occurrence.
		const lastOf52 = new Date(Date.UTC(2026, 5, 1 + 7 * 51)).toISOString().slice(0, 10);
		const nextWeek = new Date(Date.UTC(2026, 5, 1 + 7 * 52)).toISOString().slice(0, 10);
		const byDate52 = weeklyOccurrences(span, { until: lastOf52 }, ZONE);
		expect(byDate52.ok && byDate52.occurrences).toHaveLength(52);
		expect(weeklyOccurrences(span, { until: nextWeek }, ZONE)).toEqual({
			ok: false,
			reason: "too_many",
		});
	});

	it.each([
		["neither an end nor a count", {}],
		["both", { count: 3, until: "2026-09-01" }],
		["one occurrence", { count: 1 }],
		["zero", { count: 0 }],
		["a fraction", { count: 2.5 }],
		["negative", { count: -3 }],
		["an end on the first day", { until: "2026-06-01" }],
		["an end before the first day", { until: "2026-05-01" }],
		["an end that is not a date", { until: "soon" }],
		["an end under a week away", { until: "2026-06-05" }],
	])("refuses %s", (_what, recurrence) => {
		const start = at("2026-06-01", 540);
		expect(weeklyOccurrences({ start, end: start + HOUR }, recurrence, ZONE)).toEqual({
			ok: false,
			reason: "invalid",
		});
	});

	it("refuses an appointment that ends before it starts", () => {
		const start = at("2026-06-01", 540);
		expect(weeklyOccurrences({ start, end: start }, { count: 2 }, ZONE)).toEqual({
			ok: false,
			reason: "invalid",
		});
	});

	it("is the same in another zone: the wall clock of the app, not of Bucharest", () => {
		const london = "Europe/London";
		const r = resolveLocal("2026-03-22", 600, london);
		if (r.kind !== "exact") throw new Error("fixture");
		const out = weeklyOccurrences(
			{ start: r.instant, end: r.instant + HOUR },
			{ count: 2 },
			london,
		);
		if (!out.ok) throw new Error("expected occurrences");
		// London changes on the same Sunday, at 01:00.
		expect(toLocal(out.occurrences[1]?.start ?? 0, london).minutes).toBe(600);
	});
});

describe("a time of day on another day", () => {
	it("is the wall time of that day, and does not exist on the day the clocks jump over it", () => {
		const sunday = at("2026-03-29", 600);
		expect(toLocal(atWallTime(sunday, 660, ZONE) ?? 0, ZONE).minutes).toBe(660);
		expect(atWallTime(sunday, 210, ZONE)).toBeUndefined();
	});
});
