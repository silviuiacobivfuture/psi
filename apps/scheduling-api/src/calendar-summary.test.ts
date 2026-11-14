import { MAX_WINDOW_DAYS } from "@psi/scheduling-sdk/contract";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createWorld, type Populated } from "./testing/populate";
import { scaleUp } from "./testing/scale";
import { HOUR, NOW } from "./testing/world";

/**
 * calendar.summary counts per local day exactly what calendar.get would show for the same window and the same caller:
 * the month grid's numbers are the drill-in's tiles, never more (a calendar the caller may not see) nor fewer.
 */
const A = "/v1/apps/psizone";
const DAY = 24 * HOUR;
const ZONE = "Europe/Bucharest";
const local = (instant: number): string =>
	new Intl.DateTimeFormat("en-CA", {
		timeZone: ZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(instant);

type Days = { date: string; count: number }[];
type Calendar = { columns: { appointments: { start: number; status: string }[] }[] };

const summaryOf = async (w: Populated, who: string, from: number, to: number): Promise<Days> => {
	const res = await w.call(who, "GET", `${A}/calendar/summary?from=${from}&to=${to}`);
	expect(res.status, JSON.stringify(res.json)).toBe(200);
	return (res.json as { days: Days }).days;
};

/** The calendar's own visits, counted by local date: what the day views of the window would draw. */
const fromCalendar = async (w: Populated, who: string, from: number, to: number): Promise<Days> => {
	const res = await w.call(who, "GET", `${A}/calendar?from=${from}&to=${to}&columns=person`);
	expect(res.status).toBe(200);
	const counts = new Map<string, number>();
	for (const c of (res.json as Calendar).columns)
		for (const a of c.appointments)
			counts.set(local(a.start), (counts.get(local(a.start)) ?? 0) + 1);
	return [...counts]
		.map(([date, count]) => ({ date, count }))
		.sort((a, b) => a.date.localeCompare(b.date));
};

describe("calendar.summary at the clinic's size", () => {
	let w: Populated;
	beforeAll(async () => {
		w = await createWorld();
		await scaleUp(w, 1);
	}, 120_000);
	const from = NOW - 14 * DAY;
	const to = from + 42 * DAY;

	it("many visits: each day's count is the drill-in's tiles, for the owner, reception and a therapist", async () => {
		for (const who of ["olga", "rita", "dora"]) {
			const days = await summaryOf(w, who, from, to);
			expect(days, who).toEqual(await fromCalendar(w, who, from, to));
		}
		expect((await summaryOf(w, "olga", from, to)).length).toBeGreaterThan(20);
	});

	it("a therapist counts only their own calendar: fewer than reception, never more on any day", async () => {
		const all = new Map((await summaryOf(w, "rita", from, to)).map((d) => [d.date, d.count]));
		const own = await summaryOf(w, "dora", from, to);
		const sum = (d: Days): number => d.reduce((n, x) => n + x.count, 0);
		expect(sum(own)).toBeLessThan([...all.values()].reduce((n, x) => n + x, 0));
		for (const d of own) expect(d.count).toBeLessThanOrEqual(all.get(d.date) ?? 0);
	});

	it("answers dates in order, each once, every count positive (an empty day is absent)", async () => {
		const days = await summaryOf(w, "olga", from, to);
		const dates = days.map((d) => d.date);
		expect([...dates].sort()).toEqual(dates);
		expect(new Set(dates).size).toBe(dates.length);
		for (const d of days) expect(d.count).toBeGreaterThan(0);
	});
});

describe("calendar.summary: boundaries and refusals", () => {
	let w: Populated;
	beforeEach(async () => {
		w = await createWorld();
	});
	const make = async (start: number): Promise<string> => {
		const res = await w.call("olga", "POST", `${A}/appointments`, {
			practitionerId: w.ids.dora,
			clientId: w.ids.c1,
			start,
			end: start + HOUR,
		});
		expect(res.status, JSON.stringify(res.json)).toBe(200);
		return String(res.json.id);
	};

	it("an empty window answers no days", async () => {
		const far = NOW + 300 * DAY;
		expect(await summaryOf(w, "olga", far, far + 7 * DAY)).toEqual([]);
	});

	it("a visit just after local midnight counts on its local day, not on the UTC one", async () => {
		const far = NOW + 200 * DAY;
		const midnight = Date.parse(`${local(far)}T00:00:00+02:00`);
		await make(midnight + 30 * 60_000);
		const days = await summaryOf(w, "olga", midnight - DAY, midnight + DAY);
		expect(days).toEqual([{ date: local(far), count: 1 }]);
	});

	it("a cancelled visit is not counted; the others of the day still are", async () => {
		const far = NOW + 210 * DAY;
		const first = await make(far);
		await make(far + 2 * HOUR);
		expect(await summaryOf(w, "olga", far - HOUR, far + 5 * HOUR)).toEqual([
			{ date: local(far), count: 2 },
		]);
		const cancel = await w.call("olga", "POST", `${A}/appointments/${first}/cancel`, {
			reason: "test",
		});
		expect(cancel.status).toBe(200);
		expect(await summaryOf(w, "olga", far - HOUR, far + 5 * HOUR)).toEqual([
			{ date: local(far), count: 1 },
		]);
	});

	it("a therapist does not count a colleague's visit on their own day", async () => {
		const far = NOW + 220 * DAY;
		await w.call("olga", "POST", `${A}/appointments`, {
			practitionerId: w.ids.elena,
			clientId: w.ids.c2,
			start: far,
			end: far + HOUR,
		});
		expect(await summaryOf(w, "olga", far - HOUR, far + 2 * HOUR)).toEqual([
			{ date: local(far), count: 1 },
		]);
		expect(await summaryOf(w, "dora", far - HOUR, far + 2 * HOUR)).toEqual([]);
	});

	it("a window of MAX_WINDOW_DAYS is answered; one millisecond more, an empty or a reversed one is refused", async () => {
		const max = MAX_WINDOW_DAYS * DAY;
		expect(
			(await w.call("olga", "GET", `${A}/calendar/summary?from=${NOW}&to=${NOW + max}`)).status,
		).toBe(200);
		for (const to of [NOW + max + 1, NOW, NOW - DAY])
			expect(
				(await w.call("olga", "GET", `${A}/calendar/summary?from=${NOW}&to=${to}`)).status,
				String(to - NOW),
			).toBe(400);
	});

	it("a member without the calendar is refused", async () => {
		await w.call("olga", "PUT", `${A}/members/newbie`, {
			displayName: "Newbie",
			roles: [],
			coordinates: [],
		});
		const res = await w.call("newbie", "GET", `${A}/calendar/summary?from=${NOW}&to=${NOW + DAY}`);
		expect([403, 404]).toContain(res.status);
	});
});
