import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SdkConsole, startSdkConsole } from "./sdk-harness";

/**
 * The month over the real service: a tile per day with the day's count from calendar.summary (never the visits one by
 * one), each count equal to the tiles its drill-in (the day view) draws, for the owner and for a therapist who sees only
 * their own calendar. The week draws one calendar with light tiles.
 */
const A = "/v1/apps/psizone";
const HOUR = 3_600_000;
/** 2026-11-18, 10:00 in Bucharest. */
const BUSY = Date.UTC(2026, 10, 18, 8);
let k: SdkConsole;

beforeAll(async () => {
	k = await startSdkConsole();
	const w = k.api.world;
	// A busy day: five visits of dora's, one of elena's.
	for (let i = 0; i < 5; i++)
		await w.call("olga", "POST", `${A}/appointments`, {
			practitionerId: w.ids.dora,
			clientId: w.ids.c1,
			start: BUSY + i * HOUR,
			end: BUSY + i * HOUR + HOUR / 2,
		});
	await w.call("olga", "POST", `${A}/appointments`, {
		practitionerId: w.ids.elena,
		clientId: w.ids.c2,
		start: BUSY,
		end: BUSY + HOUR,
	});
});
afterAll(() => k.close());

/** The month's tiles: each day and its count, as the page carries them. */
function tilesOf(html: string): Map<string, { count: number; href: string; text: string }> {
	const out = new Map<string, { count: number; href: string; text: string }>();
	for (const m of html.matchAll(/<a class="cal-month__day"([^>]*)>(.*?)<\/a>/gs)) {
		const attrs = m[1] ?? "";
		const day = /data-day="([^"]+)"/.exec(attrs)?.[1] ?? "";
		out.set(day, {
			count: Number(/data-count="(\d+)"/.exec(attrs)?.[1] ?? "-1"),
			href: (/href="([^"]+)"/.exec(attrs)?.[1] ?? "").replaceAll("&amp;", "&"),
			text: m[2] ?? "",
		});
	}
	return out;
}
const tilesOnDay = (html: string): number =>
	html.split('class="cal__appt cal__appt--wash').length - 1;

describe("the month counts what each day shows", () => {
	it("six weeks of tiles; a busy day counts its visits and links to that day", async () => {
		const s = await k.as("olga");
		const tiles = tilesOf(await (await s.get("/calendar?view=month&date=2026-11-18")).text());
		expect(tiles.size).toBe(42);
		const busy = tiles.get("2026-11-18");
		expect(busy?.count).toBeGreaterThanOrEqual(6);
		expect(busy?.href).toBe("/calendar?view=day&date=2026-11-18");
		expect(busy?.text).toContain("programări");
	});

	it("every day's count is its drill-in's tiles, for the owner and for a therapist", async () => {
		for (const who of ["olga", "dora"]) {
			const s = await k.as(who);
			const tiles = tilesOf(await (await s.get("/calendar?view=month&date=2026-11-18")).text());
			const days = [...tiles].filter(([, t]) => t.count > 0);
			expect(days.length, who).toBeGreaterThan(0);
			// The days with visits, and one without: an empty day says nothing and its day view has no tile.
			const empty = [...tiles].find(([, t]) => t.count === 0);
			for (const [day, t] of [...days, ...(empty === undefined ? [] : [empty])]) {
				const html = await (await s.get(t.href)).text();
				expect(t.count === 0 ? html.includes("cal__appt") : tilesOnDay(html), `${who} ${day}`).toBe(
					t.count === 0 ? false : t.count,
				);
			}
		}
	});

	it("a therapist counts only their own calendar: never more than the owner on any day, fewer on the busy one", async () => {
		const owner = tilesOf(
			await (await (await k.as("olga")).get("/calendar?view=month&date=2026-11-18")).text(),
		);
		const own = tilesOf(
			await (await (await k.as("dora")).get("/calendar?view=month&date=2026-11-18")).text(),
		);
		for (const [day, t] of own)
			expect(t.count, day).toBeLessThanOrEqual(owner.get(day)?.count ?? 0);
		expect(own.get("2026-11-18")?.count).toBeLessThan(owner.get("2026-11-18")?.count ?? 0);
	});

	it("an empty month says so, with no tile", async () => {
		const html = await (
			await (await k.as("olga")).get("/calendar?view=month&date=2028-02-10")
		).text();
		expect(html).toContain("Nicio programare");
		expect(html).not.toContain("cal-month__day");
	});

	it("the month has no column filter: it counts every calendar the person may see", async () => {
		const html = await (
			await (await k.as("olga")).get("/calendar?view=month&date=2026-11-18")
		).text();
		expect(html).not.toContain("cat=therapy");
		const week = await (
			await (await k.as("olga")).get("/calendar?view=week&date=2026-11-18")
		).text();
		expect(week).toContain("cat=therapy");
	});
});

describe("the week draws one calendar, lightly", () => {
	it("only the chosen calendar's visits, each as a light tile with its time and status", async () => {
		const s = await k.as("olga");
		const w = k.api.world;
		const html = await (
			await s.get(`/calendar?view=week&date=2026-11-18&col=${w.ids.dora}`)
		).text();
		expect(html).toContain("cal--week");
		const lite = html.split("cal__appt--lite").length - 1;
		expect(lite).toBeGreaterThanOrEqual(5);
		// the other calendars' visits are not drawn, and no tile carries a monogram or a service line
		expect(html).not.toContain("cal__mono");
		expect(html).not.toContain("cal__svc");
		expect(html).toContain("10:00");
		const other = await (
			await s.get(`/calendar?view=week&date=2026-11-18&col=${w.ids.elena}`)
		).text();
		expect(other.split("cal__appt--lite").length - 1).toBeLessThan(lite);
	});

	it("an empty week of one calendar still shows its grid and the chips to the others", async () => {
		const html = await (
			await (await k.as("olga")).get("/calendar?view=week&date=2028-02-10")
		).text();
		expect(html).toContain("cal--week");
		expect(html).toContain("cal-chip");
		expect(html).not.toContain("cal__appt");
	});
});

/** The week's tiles (their appointment ids) and its chips (the calendars offered, in order, and the one drawn). */
const weekOf = (html: string) => ({
	tiles: [...html.matchAll(/cal__appt--lite[^"]*"[^>]*?appt=([^"&]+)"/g)]
		.map((x) => x[1] ?? "")
		.sort(),
	chips: [...html.matchAll(/class="cal-chip" href="[^"]*?col=([^"&]+)"/g)].map((x) => x[1] ?? ""),
	drawn: /class="cal-chip" href="[^"]*?col=([^"&]+)" aria-current="true"/.exec(html)?.[1],
});
const WEEK = "/calendar?view=week&date=2026-11-18";
const MONDAY = Date.UTC(2026, 10, 15, 22);

describe("the week reads one calendar, the others by name only", () => {
	/** What the service's whole calendar shows for one column in the week: the tiles the week must draw. */
	const column = async (who: string, id: string): Promise<{ ids: string[]; all: string[] }> => {
		const got = await k.api.world.call(
			who,
			"GET",
			`${A}/calendar?from=${MONDAY}&to=${MONDAY + 7 * 24 * HOUR}&columns=person`,
		);
		const cols = got.json.columns as { id: string; appointments: { id: string }[] }[];
		return {
			ids: (cols.find((c) => c.id === id)?.appointments ?? []).map((a) => a.id).sort(),
			all: cols.map((c) => c.id),
		};
	};

	it("the calendar chosen: exactly its visits, and a chip for every calendar in the day view's order", async () => {
		const w = k.api.world;
		const s = await k.as("olga");
		for (const id of [w.ids.dora, w.ids.elena]) {
			const week = weekOf(await (await s.get(`${WEEK}&col=${id}`)).text());
			const whole = await column("olga", id);
			expect(week.drawn).toBe(id);
			expect(week.tiles).toEqual(whole.ids);
			expect(week.chips).toEqual(whole.all);
		}
	});

	it("no calendar chosen, or one that is not the person's: the first calendar, by name", async () => {
		const s = await k.as("olga");
		const whole = await column("olga", "");
		const first = whole.all[0] ?? "";
		for (const path of [WEEK, `${WEEK}&col=nosuchcolumn00000000000000000`]) {
			const week = weekOf(await (await s.get(path)).text());
			expect(week.drawn, path).toBe(first);
			expect(week.tiles, path).toEqual((await column("olga", first)).ids);
			expect(week.chips, path).toEqual(whole.all);
		}
	});

	it("a therapist asking for a colleague's calendar gets their own, and no chip or visit of the colleague's", async () => {
		const w = k.api.world;
		const html = await (await (await k.as("dora")).get(`${WEEK}&col=${w.ids.elena}`)).text();
		const week = weekOf(html);
		expect(week.drawn).toBe(w.ids.dora);
		expect(week.chips).toEqual([w.ids.dora]);
		expect(week.tiles).toEqual((await column("dora", w.ids.dora)).ids);
		for (const id of (await column("olga", w.ids.elena)).ids) expect(html).not.toContain(id);
	});
});
