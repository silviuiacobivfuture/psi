import { describe, expect, it } from "vitest";
import { addDays } from "../lib/dates";
import { type Appointment, appointmentDefaults, type Column } from "../port/schema";
import { columnsOf, findConflicts, overlaps, seriesDates, suggest } from "./conflicts";

const appt = (
	id: string,
	start: number,
	dur: number,
	col = "p1",
	extra: Partial<Appointment> = {},
): Appointment => ({
	id,
	date: "2026-11-16",
	startMin: start,
	durationMin: dur,
	columnId: col,
	clientId: "c1",
	title: null,
	serviceId: "s1",
	status: "confirmed",
	note: "",
	...appointmentDefaults(),
	...extra,
});
const probe = (start: number, dur: number, cols: string[] = ["p1"]) => ({
	date: "2026-11-16",
	startMin: start,
	durationMin: dur,
	columnIds: cols,
});

describe("overlaps", () => {
	it.each([
		[600, 650, 650, 700, false],
		[600, 650, 649, 700, true],
		[600, 650, 500, 600, false],
		[600, 650, 500, 601, true],
		[600, 650, 610, 620, true],
		[610, 620, 600, 650, true],
	])("%i-%i vs %i-%i -> %s", (a, b, c, d, r) => expect(overlaps(a, b, c, d)).toBe(r));
});

describe("findConflicts", () => {
	const all = [
		appt("a", 600, 60),
		appt("b", 720, 60, "p2"),
		appt("c", 600, 60, "p3", { resourceIds: ["d1", "r1"] }),
	];
	it("none in a free gap, and a touching end or start is free", () => {
		expect(findConflicts(all, probe(660, 60))).toEqual([]);
		expect(findConflicts(all, probe(540, 60))).toEqual([]);
	});
	it("the same column at an overlapping time conflicts, naming the other appointment", () => {
		expect(findConflicts(all, probe(630, 60))).toEqual([
			{ columnId: "p1", appointmentId: "a", startMin: 600, endMin: 660 },
		]);
	});
	it("another column at the same time does not conflict", () => {
		expect(findConflicts(all, probe(600, 60, ["p2"]))).toEqual([]);
	});
	it("a room or device used by another appointment is busy even in another column", () => {
		const got = findConflicts(all, probe(600, 60, ["p1", "d1"]));
		expect(got.map((c) => [c.columnId, c.appointmentId])).toEqual([
			["p1", "a"],
			["d1", "c"],
		]);
	});
	it("a cancelled appointment frees its time", () => {
		expect(
			findConflicts([appt("x", 600, 60, "p1", { status: "cancelled" })], probe(600, 60)),
		).toEqual([]);
	});
	it("another day never conflicts", () => {
		expect(
			findConflicts([appt("x", 600, 60, "p1", { date: "2026-11-17" })], probe(600, 60)),
		).toEqual([]);
	});
	it("the appointment being edited never conflicts with itself; nor does its series", () => {
		expect(findConflicts(all, { ...probe(600, 60), ignoreId: "a" })).toEqual([]);
		const s = [appt("s1", 600, 60, "p1", { seriesId: "S" })];
		expect(findConflicts(s, { ...probe(600, 60), ignoreSeriesId: "S" })).toEqual([]);
		expect(findConflicts(s, { ...probe(600, 60), ignoreSeriesId: null })).toHaveLength(1);
	});
	it("an empty day and a zero-length probe never conflict", () => {
		expect(findConflicts([], probe(600, 60))).toEqual([]);
		expect(findConflicts(all, probe(610, 0))).toHaveLength(1);
	});
	it("columnsOf lists the column first, then the resources", () => {
		expect(columnsOf(appt("c", 1, 1, "p3", { resourceIds: ["d1"] }))).toEqual(["p3", "d1"]);
	});
});

describe("suggest", () => {
	const cols: Column[] = [
		{ id: "p1", kind: "person", name: "Irina", colour: 1 },
		{ id: "p2", kind: "person", name: "Ana", colour: 2 },
		{ id: "d1", kind: "device", name: "NFB 1", colour: 3 },
	];
	it("offers the next free quarter-hour and the free colleagues of the same kind", () => {
		const all = [appt("a", 600, 60, "p1"), appt("b", 600, 60, "p2")];
		const s = suggest(all, cols, probe(600, 60));
		expect(s.laterStart).toBe(660);
		expect(s.otherColumns).toEqual([]);
		const free = suggest([appt("a", 600, 60, "p1")], cols, probe(600, 60));
		expect(free.otherColumns.map((c) => c.id)).toEqual(["p2"]);
	});
	it("offers nothing later when the day is full", () => {
		const all = [appt("a", 420, 14 * 60, "p1")];
		expect(suggest(all, cols, probe(600, 60)).laterStart).toBeNull();
	});
});

describe("seriesDates", () => {
	it("by count", () => {
		expect(seriesDates("2026-11-16", { count: 3 }, addDays)).toEqual([
			"2026-11-16",
			"2026-11-23",
			"2026-11-30",
		]);
	});
	it("until a day, inclusive", () => {
		expect(seriesDates("2026-11-16", { until: "2026-11-30" }, addDays)).toEqual([
			"2026-11-16",
			"2026-11-23",
			"2026-11-30",
		]);
		expect(seriesDates("2026-11-16", { until: "2026-11-29" }, addDays)).toEqual([
			"2026-11-16",
			"2026-11-23",
		]);
	});
	it("is the first day alone with no rule, and never more than a year of weeks", () => {
		expect(seriesDates("2026-11-16", {}, addDays)).toEqual(["2026-11-16"]);
		expect(seriesDates("2026-11-16", { until: "2099-01-01" }, addDays).length).toBe(52);
	});
});
