import { describe, expect, it } from "vitest";
import {
	blockProblem,
	busyOfVisits,
	dayAvailability,
	findOverlaps,
	moneyOf,
	nextCredit,
	remainingSessions,
	rosterProblem,
	toMinor,
	usageMismatch,
	usageOf,
	type VisitSpan,
	visitProblems,
	wallToInstant,
} from "../clinic";

const ZONE = "Europe/Bucharest";
const H = 3_600_000;
const T0 = Date.UTC(2026, 5, 1, 7); // 10:00 Bucharest

const visit = (
	id: string,
	over: Partial<VisitSpan> & Pick<VisitSpan, "column">,
	start = 0,
	hours = 1,
): VisitSpan => ({
	id,
	status: "confirmed",
	start: T0 + start * H,
	end: T0 + (start + hours) * H,
	...over,
});

describe("overlaps on a practitioner, a device, a room", () => {
	const NOW = T0 - 24 * H;

	it("finds two visits of one practitioner at the same time and reports each pair once", () => {
		const p = { kind: "practitioner", id: "p1" } as const;
		const found = findOverlaps([visit("b", { column: p }), visit("a", { column: p }, 0.5)], NOW);
		expect(found).toEqual([{ a: "a", b: "b", resource: "practitioner", resourceId: "p1" }]);
	});

	it("touching spans do not overlap", () => {
		const p = { kind: "practitioner", id: "p1" } as const;
		expect(findOverlaps([visit("a", { column: p }), visit("b", { column: p }, 1)], NOW)).toEqual(
			[],
		);
	});

	it("finds a device used under another practitioner's column, and a room under a column", () => {
		const found = findOverlaps(
			[
				visit("a", { column: { kind: "practitioner", id: "p1" }, device: "nfb1", room: "r1" }),
				visit("b", { column: { kind: "practitioner", id: "p2" }, device: "nfb1" }),
				visit("c", { column: { kind: "room", id: "r1" } }),
			],
			NOW,
		);
		expect(found.map((o) => `${o.a}${o.b}:${o.resource}`)).toEqual(["ab:device", "ac:room"]);
	});

	it("a group activity is not exclusive: many visits of one group may coincide", () => {
		const g = { kind: "group", id: "g1" } as const;
		expect(findOverlaps([visit("a", { column: g }), visit("b", { column: g })], NOW)).toEqual([]);
	});

	it("ignores cancelled, declined and expired visits", () => {
		const p = { kind: "practitioner", id: "p1" } as const;
		const list = (["cancelled", "declined", "expired"] as const).map((status, i) =>
			visit(`x${i}`, { column: p, status }),
		);
		expect(findOverlaps([...list, visit("a", { column: p })], NOW)).toEqual([]);
	});

	it("a staff visit takes the practitioner's time from the public booking flow", () => {
		const spans = [
			visit("a", { column: { kind: "practitioner", id: "p1" } }),
			visit("b", { column: { kind: "practitioner", id: "p2" } }),
			visit("c", { column: { kind: "device", id: "nfb1" } }),
		];
		expect(busyOfVisits(spans, "p1", NOW)).toEqual([{ start: T0, until: T0 + H }]);
		expect(busyOfVisits(spans, "p3", NOW)).toEqual([]);
	});
});

describe("wall time to instants", () => {
	it("reads Bucharest summer and winter time", () => {
		expect(wallToInstant("2026-06-01", "10:00", ZONE)).toEqual({ ok: true, instant: T0 });
		expect(wallToInstant("2026-01-15", "10:00", ZONE)).toEqual({
			ok: true,
			instant: Date.UTC(2026, 0, 15, 8),
		});
	});

	it("on 2026-10-25 the repeated hour takes the earlier instant", () => {
		const first = wallToInstant("2026-10-25", "03:30", ZONE);
		expect(first).toEqual({ ok: true, instant: Date.UTC(2026, 9, 25, 0, 30) });
		const after = wallToInstant("2026-10-25", "04:00", ZONE);
		expect(after).toEqual({ ok: true, instant: Date.UTC(2026, 9, 25, 2, 0) });
	});

	it("a wall time the clocks skip does not exist; bad dates and times are told apart", () => {
		expect(wallToInstant("2026-03-29", "03:30", ZONE)).toEqual({
			ok: false,
			problem: "nonexistent",
		});
		expect(wallToInstant("2026-02-30", "10:00", ZONE)).toEqual({ ok: false, problem: "bad_date" });
		expect(wallToInstant("2026-06-01", "25:00", ZONE)).toEqual({ ok: false, problem: "bad_time" });
		expect(wallToInstant("2026-06-01", "24:00", ZONE)).toEqual({ ok: false, problem: "bad_time" });
		expect(wallToInstant("2026-06-01", "10h", ZONE)).toEqual({ ok: false, problem: "bad_time" });
	});
});

describe("visit soundness", () => {
	const ok = {
		column: { kind: "practitioner", id: "p1" } as const,
		client: "c1",
		start: T0,
		end: T0 + H,
		durationMinutes: 60,
	};

	it("a sound visit has no problems; a visit without a client is a block or a group activity", () => {
		expect(visitProblems(ok)).toEqual([]);
		expect(
			visitProblems({ ...ok, client: undefined, column: { kind: "group", id: "g1" } }),
		).toEqual([]);
	});

	it.each([
		["end_not_after_start", { end: T0 }],
		["duration_mismatch", { durationMinutes: 45 }],
		["negative_money", { priceMinor: -1 }],
		["credit_without_package", { creditType: "base" as const }],
	])("refuses %s", (problem, patch) => {
		expect(visitProblems({ ...ok, ...patch })).toContain(problem);
	});
});

describe("packages: derived usage, never a counter", () => {
	const NOW = Date.UTC(2026, 5, 10);
	const visits = [
		{
			status: "confirmed",
			attendance: "attended",
			creditType: "base",
			start: NOW - 5 * 86_400_000,
		},
		{ status: "confirmed", attendance: "pending", creditType: "base", start: NOW - 86_400_000 },
		{ status: "confirmed", attendance: "absent", creditType: "base", start: NOW - 86_400_000 },
		{ status: "cancelled", attendance: "pending", creditType: "base", start: NOW - 86_400_000 },
		{ status: "confirmed", attendance: "attended", creditType: "bonus", start: NOW - 1000 },
		{ status: "confirmed", attendance: "pending", creditType: "base", start: NOW + 86_400_000 },
		{
			status: "confirmed",
			attendance: "pending",
			creditType: "bonus",
			start: NOW + 2 * 86_400_000,
		},
	] as const;

	it("counts past, present-day attended visits as used and future ones as scheduled", () => {
		expect(usageOf(visits, NOW)).toEqual({
			baseUsed: 2,
			bonusUsed: 1,
			baseScheduled: 1,
			bonusScheduled: 1,
		});
	});

	it("computes what remains, and what is not yet booked", () => {
		const usage = usageOf(visits, NOW);
		expect(remainingSessions({ totalSessions: 10, bonusSessions: 2 }, usage)).toEqual({
			baseRemaining: 8,
			bonusRemaining: 1,
			remaining: 9,
			unbooked: 7,
			overdrawn: 0,
		});
	});

	it("reports overdrawn use instead of hiding it", () => {
		const usage = usageOf(visits, NOW);
		expect(remainingSessions({ totalSessions: 1, bonusSessions: 0 }, usage)).toMatchObject({
			baseRemaining: 0,
			bonusRemaining: 0,
			overdrawn: 2,
		});
	});

	it("an empty package has everything left and nothing booked", () => {
		const usage = usageOf([], NOW);
		expect(remainingSessions({ totalSessions: 5, bonusSessions: 1 }, usage).unbooked).toBe(6);
		expect(remainingSessions({ totalSessions: 0, bonusSessions: 0 }, usage).remaining).toBe(0);
	});

	it("the next visit takes base credit first, then bonus, then none", () => {
		const usage = usageOf(visits, NOW); // base 2+1, bonus 1+1
		expect(nextCredit({ totalSessions: 4, bonusSessions: 3 }, usage)).toBe("base");
		expect(nextCredit({ totalSessions: 3, bonusSessions: 3 }, usage)).toBe("bonus");
		expect(nextCredit({ totalSessions: 3, bonusSessions: 2 }, usage)).toBeUndefined();
	});

	it("tells a stored counter that disagrees from one that agrees", () => {
		const usage = usageOf(visits, NOW);
		expect(usageMismatch({ used: 2, bonusUsed: 1 }, usage)).toBeUndefined();
		expect(usageMismatch({ used: 5, bonusUsed: 1 }, usage)).toEqual({
			storedBase: 5,
			derivedBase: 2,
			storedBonus: 1,
			derivedBonus: 1,
		});
	});
});

describe("money in bani", () => {
	it("reads numbers and numeric strings, refuses what is not an amount", () => {
		expect(toMinor(150)).toBe(15_000);
		expect(toMinor("150,5")).toBe(15_050);
		expect(toMinor(0.1 + 0.2)).toBe(30);
		expect(toMinor(0)).toBe(0);
		for (const bad of [-1, "x", "", Number.NaN, Number.POSITIVE_INFINITY, null, undefined]) {
			expect(toMinor(bad)).toBeUndefined();
		}
	});

	it("remaining money is the price less the ledger, with refunds and overpayment", () => {
		expect(moneyOf(100_000, [{ amountMinor: 40_000 }, { amountMinor: 10_000 }])).toEqual({
			paidMinor: 50_000,
			remainingMinor: 50_000,
			overpaidMinor: 0,
		});
		expect(moneyOf(100_000, [{ amountMinor: 120_000 }, { amountMinor: -30_000 }])).toMatchObject({
			remainingMinor: 10_000,
		});
		expect(moneyOf(100_000, [{ amountMinor: 120_000 }])).toMatchObject({
			remainingMinor: 0,
			overpaidMinor: 20_000,
		});
		expect(moneyOf(0, [])).toEqual({ paidMinor: 0, remainingMinor: 0, overpaidMinor: 0 });
	});
});

describe("roster", () => {
	it("works needs ordered hours inside the day", () => {
		expect(rosterProblem({ status: "works", startMinutes: 540, endMinutes: 1020 })).toBeUndefined();
		expect(rosterProblem({ status: "works", startMinutes: 1020, endMinutes: 540 })).toBe(
			"hours_not_ordered",
		);
		expect(rosterProblem({ status: "works", startMinutes: 540, endMinutes: 540 })).toBe(
			"hours_not_ordered",
		);
		expect(rosterProblem({ status: "works", startMinutes: -1, endMinutes: 60 })).toBe(
			"hours_out_of_range",
		);
		expect(rosterProblem({ status: "works", startMinutes: 0, endMinutes: 1441 })).toBe(
			"hours_out_of_range",
		);
		expect(rosterProblem({ status: "works", startMinutes: 1.5, endMinutes: 60 })).toBe(
			"hours_required",
		);
		expect(rosterProblem({ status: "free" })).toBeUndefined();
	});

	it("blocks are real date ranges", () => {
		expect(
			blockProblem({ dateStart: "2026-07-01", dateEnd: "2026-07-01", reason: "x" }),
		).toBeUndefined();
		expect(blockProblem({ dateStart: "2026-07-02", dateEnd: "2026-07-01", reason: "x" })).toBe(
			"ends_before_start",
		);
		expect(blockProblem({ dateStart: "2026-02-30", dateEnd: "2026-03-01", reason: "x" })).toBe(
			"bad_date",
		);
	});

	it("leave and blocks beat working hours; no entry is unplanned", () => {
		const works = { status: "works", startMinutes: 540, endMinutes: 1020 } as const;
		const block = [{ dateStart: "2026-07-01", dateEnd: "2026-07-03", reason: "training" }];
		expect(dayAvailability(works, [], "2026-07-01")).toEqual({
			kind: "works",
			startMinutes: 540,
			endMinutes: 1020,
		});
		expect(dayAvailability(works, block, "2026-07-03")).toEqual({ kind: "off", why: "blocked" });
		expect(dayAvailability(works, block, "2026-07-04").kind).toBe("works");
		expect(dayAvailability({ status: "annual_leave" }, [], "2026-07-01")).toEqual({
			kind: "off",
			why: "annual_leave",
		});
		expect(dayAvailability({ status: "medical_leave" }, block, "2026-07-01")).toEqual({
			kind: "off",
			why: "medical_leave",
		});
		expect(dayAvailability({ status: "free" }, [], "2026-07-01")).toEqual({
			kind: "off",
			why: "free",
		});
		expect(dayAvailability(undefined, [], "2026-07-01")).toEqual({ kind: "off", why: "unplanned" });
	});
});
