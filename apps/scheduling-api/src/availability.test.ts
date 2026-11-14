import { Availability, AvailabilityPreview } from "@psi/scheduling-sdk/contract";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Populated } from "./testing/populate";
import { HOUR, NOW, type Reply } from "./testing/world";
import { type WorldFactory, worldFactories } from "./testing/worlds";

/**
 * The availability editor's routes: a practitioner's weekly rules replaced whole, one-off days for one or several
 * practitioners, the rooms' closed days, own versus all, every refusal its own case with nothing written, a daylight-
 * saving boundary in Europe/Bucharest, and the preview equal to what the public site offers. Runs on every adapter.
 */
const A = "/v1/apps/psizone";
const DAY = 24 * HOUR;
const factories = await worldFactories();
let w: Populated;
let adapter: WorldFactory["name"];

const as = (who: string, method: string, path: string, body?: unknown): Promise<Reply> =>
	w.call(who, method, `${A}${path}`, body);
const site = (path: string): Promise<Reply> =>
	w.callKey("psizone-web", "GET", `${A}${path}`, undefined, { "x-psi-client-ip": "203.0.113.11" });
const problems = (
	r: Reply,
): { reason: string; index?: number; date?: string; personId?: string }[] =>
	((r.json.error as { detail?: { problems?: [] } }).detail?.problems ?? []) as never;
const rulesOf = async (person: string) =>
	Availability.parse(
		(await as("olga", "GET", `/people/${person}/availability?from=2026-01-01`)).json,
	);
/** How the visitor flow names a practitioner: the people id in memory, the practitioner's Convex id there. */
const visitorId = (person: string): string => (adapter === "convex" ? person.slice(1) : person);
const put = (who: string, person: string, rules: unknown[]) =>
	as(who, "PUT", `/people/${person}/availability/rules`, { rules });
const rule = (
	weekday: number,
	start: number,
	end: number,
	extra: Record<string, unknown> = {},
) => ({
	weekday,
	start,
	end,
	modes: ["onsite", "online"],
	...extra,
});
const WEEK = [1, 2, 3, 4, 5].flatMap((d) => [rule(d, 540, 780), rule(d, 900, 1140)]);
const localHour = (instant: number): number =>
	Number(
		new Intl.DateTimeFormat("en-GB", {
			timeZone: "Europe/Bucharest",
			hour: "2-digit",
			hour12: false,
		}).format(new Date(instant)),
	);
const localDate = (instant: number): string =>
	new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest" }).format(new Date(instant));

async function previewAndPublic(person: string, from: number, to: number) {
	const preview = AvailabilityPreview.parse(
		(
			await as(
				"olga",
				"GET",
				`/people/${person}/availability/preview?service=evaluation&from=${from}&to=${to}`,
			)
		).json,
	);
	const offered = (await site(`/book/slots?service=evaluation&from=${from}&to=${to}&limit=200`))
		.json.slots as {
		practitioner: string;
		start: number;
		end: number;
		modes: string[];
	}[];
	const mine = offered.filter((s) => s.practitioner === visitorId(person));
	const key = (s: { start: number; end: number }) => `${s.start}-${s.end}`;
	return {
		preview: [...new Set(preview.slots.map(key))],
		offered: [...new Set(mine.map(key))],
		raw: preview,
	};
}

describe.each(factories)("availability, on the $name store", (factory) => {
	beforeAll(async () => {
		w = await factory.create();
		adapter = factory.name;
	});
	afterAll(() => factory.cleanup());

	describe("weekly rules", () => {
		it("shows a practitioner's rules and refuses a person who is not one", async () => {
			const got = await rulesOf(w.ids.dora);
			expect(got.timeZone).toBe("Europe/Bucharest");
			expect(got.rules.length).toBeGreaterThan(0);
			expect(
				(await as("olga", "GET", `/people/${w.ids.mara}/availability?from=2026-01-01`)).status,
			).toBe(404);
		});

		it("replaces the whole set: a split day (09:00-13:00 and 15:00-19:00) and an effective range", async () => {
			const rules = [
				...WEEK,
				rule(6, 600, 840, { validFrom: "2026-12-01", validUntil: "2026-12-31" }),
			];
			const r = await put("olga", w.ids.dora, rules);
			expect(r.status, JSON.stringify(r.json)).toBe(200);
			const got = await rulesOf(w.ids.dora);
			expect(got.rules).toHaveLength(11);
			expect(got.rules.filter((x) => x.weekday === 1).map((x) => [x.start, x.end])).toEqual([
				[540, 780],
				[900, 1140],
			]);
			expect(got.rules.find((x) => x.weekday === 6)).toMatchObject({
				validFrom: "2026-12-01",
				validUntil: "2026-12-31",
			});
		});

		it("keeps the alternating weeks and the period schedules it is given back", async () => {
			const rules = [
				rule(1, 540, 720, { week: "A" }),
				rule(1, 780, 960, { week: "B" }),
				rule(2, 600, 700, { override: true, validFrom: "2027-07-01", validUntil: "2027-08-31" }),
				rule(2, 540, 1020),
			];
			expect((await put("olga", w.ids.elena, rules)).status).toBe(200);
			const got = (await rulesOf(w.ids.elena)).rules;
			expect(got.filter((x) => x.week !== undefined).map((x) => x.week)).toEqual(["A", "B"]);
			expect(got.find((x) => x.override === true)).toMatchObject({ validFrom: "2027-07-01" });
		});

		it.each([
			["an overlap", [rule(1, 540, 780), rule(1, 720, 900)], "overlap"],
			["an end before its start", [rule(1, 780, 540)], "end_before_start"],
			["a time off the five-minute grid", [rule(1, 541, 780)], "grid"],
			["a date that does not exist", [rule(1, 540, 780, { validFrom: "2026-02-30" })], "bad_date"],
			[
				"an until before its from",
				[rule(1, 540, 780, { validFrom: "2027-02-01", validUntil: "2027-01-01" })],
				"validity",
			],
			["a period without its start", [rule(1, 540, 780, { override: true })], "period_start"],
			[
				"a seventh interval in a day",
				[0, 1, 2, 3, 4, 5, 6].map((i) => rule(3, 420 + i * 120, 480 + i * 120)),
				"too_many_intervals",
			],
		])("refuses %s with its reason, and writes nothing", async (_name, rules, why) => {
			const before = await rulesOf(w.ids.dora);
			const r = await put("olga", w.ids.dora, rules);
			expect(r.status).toBe(400);
			expect(problems(r).map((p) => p.reason)).toContain(why);
			expect(await rulesOf(w.ids.dora)).toEqual(before);
		});

		it("refuses more rules than a set holds, and malformed ones, writing nothing", async () => {
			const before = await rulesOf(w.ids.dora);
			const many = Array.from({ length: 121 }, (_, i) => rule((i % 7) + 1, 0, 5));
			expect((await put("olga", w.ids.dora, many)).status).toBe(400);
			expect((await put("olga", w.ids.dora, [rule(8, 540, 600)])).status).toBe(400);
			expect((await put("olga", w.ids.dora, [{ ...rule(1, 540, 600), modes: [] }])).status).toBe(
				400,
			);
			expect(await rulesOf(w.ids.dora)).toEqual(before);
		});

		it("lets a therapist edit their own hours, not a colleague's; reception reads all and edits none", async () => {
			expect((await put("dora", w.ids.dora, WEEK)).status).toBe(200);
			const before = await rulesOf(w.ids.elena);
			expect((await put("dora", w.ids.elena, WEEK)).status).toBe(404);
			expect(
				(await as("dora", "GET", `/people/${w.ids.elena}/availability?from=2026-01-01`)).status,
			).toBe(404);
			expect(
				(await as("rita", "GET", `/people/${w.ids.elena}/availability?from=2026-01-01`)).status,
			).toBe(200);
			expect((await put("rita", w.ids.elena, WEEK)).status).toBe(404);
			expect(
				(await as("vera", "GET", `/people/${w.ids.dora}/availability?from=2026-01-01`)).status,
			).toBe(404);
			expect(await rulesOf(w.ids.elena)).toEqual(before);
		});
	});

	describe("copying to several practitioners", () => {
		it("gives the others the same rules", async () => {
			expect((await put("olga", w.ids.dora, WEEK)).status).toBe(200);
			const r = await as("olga", "POST", "/availability/copy", {
				from: w.ids.dora,
				to: [w.ids.elena],
			});
			expect(r.status).toBe(200);
			expect((await rulesOf(w.ids.elena)).rules).toEqual((await rulesOf(w.ids.dora)).rules);
		});

		it("copies to none when the caller may not edit one of them, or one is not a practitioner", async () => {
			expect((await put("olga", w.ids.elena, [rule(2, 600, 660)])).status).toBe(200);
			const before = await rulesOf(w.ids.elena);
			expect(
				(await as("dora", "POST", "/availability/copy", { from: w.ids.dora, to: [w.ids.elena] }))
					.status,
			).toBe(404);
			expect(
				(
					await as("olga", "POST", "/availability/copy", {
						from: w.ids.dora,
						to: [w.ids.elena, w.ids.mara],
					})
				).status,
			).toBe(404);
			expect(
				(await as("olga", "POST", "/availability/copy", { from: w.ids.dora, to: [w.ids.dora] }))
					.status,
			).toBe(400);
			expect(await rulesOf(w.ids.elena)).toEqual(before);
		});
	});

	describe("one-off days", () => {
		const days = async (person: string, from: string) =>
			Availability.parse(
				(await as("olga", "GET", `/people/${person}/availability?from=${from}`)).json,
			).exceptions;

		it("closes a range for several practitioners at once, one row per date", async () => {
			const r = await as("olga", "POST", "/availability/one-offs", {
				personIds: [w.ids.dora, w.ids.elena],
				entry: { from: "2026-12-24", until: "2026-12-26", kind: "closed" },
			});
			expect(r.status, JSON.stringify(r.json)).toBe(200);
			for (const p of [w.ids.dora, w.ids.elena])
				expect(
					(await days(p, "2026-12-24")).filter((d) => d.date <= "2026-12-26").map((d) => d.date),
				).toEqual(["2026-12-24", "2026-12-25", "2026-12-26"]);
		});

		it("adds to none when one of them clashes, naming who and which date", async () => {
			await as("olga", "POST", "/availability/one-offs", {
				personIds: [w.ids.elena],
				entry: { from: "2027-01-05", kind: "closed" },
			});
			const doraBefore = await days(w.ids.dora, "2027-01-01");
			const r = await as("olga", "POST", "/availability/one-offs", {
				personIds: [w.ids.dora, w.ids.elena],
				entry: { from: "2027-01-04", until: "2027-01-06", kind: "closed" },
			});
			expect(r.status).toBe(400);
			expect(problems(r)).toEqual([
				{ reason: "duplicate", date: "2027-01-05", personId: w.ids.elena },
			]);
			expect(await days(w.ids.dora, "2027-01-01")).toEqual(doraBefore);
		});

		it.each([
			[
				"a range that ends before it starts",
				{ from: "2027-02-10", until: "2027-02-01", kind: "closed" },
				"range_order",
			],
			["extra hours without hours", { from: "2027-02-10", kind: "open" }, "open_needs_hours"],
			[
				"one time without the other",
				{ from: "2027-02-10", kind: "closed", start: 600 },
				"times_pair",
			],
			[
				"hours the wrong way round",
				{ from: "2027-02-10", kind: "open", start: 900, end: 600 },
				"end_before_start",
			],
			[
				"a range longer than three months",
				{ from: "2027-01-01", until: "2027-06-30", kind: "closed" },
				"range_too_long",
			],
			[
				"an hour the spring change skips (03:30 on 2027-03-28)",
				{ from: "2027-03-28", kind: "open", start: 210, end: 300 },
				"dst_gap",
			],
		])("refuses %s, writing nothing", async (_name, entry, why) => {
			const before = await days(w.ids.dora, "2026-01-01");
			const r = await as("olga", "POST", "/availability/one-offs", {
				personIds: [w.ids.dora],
				entry,
			});
			expect(r.status).toBe(400);
			expect(problems(r).map((p) => p.reason)).toContain(why);
			expect(await days(w.ids.dora, "2026-01-01")).toEqual(before);
		});

		it("removes one day, and answers 404 for one that is not theirs", async () => {
			await as("olga", "POST", "/availability/one-offs", {
				personIds: [w.ids.dora],
				entry: { from: "2027-02-15", kind: "closed", start: 720, end: 1080 },
			});
			const row = (await days(w.ids.dora, "2027-02-15")).find((d) => d.date === "2027-02-15");
			if (row === undefined) throw new Error("not added");
			expect(
				(await as("olga", "DELETE", `/people/${w.ids.elena}/availability/one-offs/${row.id}`))
					.status,
			).toBe(404);
			expect(
				(await as("olga", "DELETE", `/people/${w.ids.dora}/availability/one-offs/${row.id}`))
					.status,
			).toBe(200);
			expect((await days(w.ids.dora, "2027-02-15")).some((d) => d.id === row.id)).toBe(false);
		});
	});

	describe("the preview is what the public site offers", () => {
		it("equals the visitor's free times of that practitioner, a closed day and extra hours included", async () => {
			expect((await put("olga", w.ids.dora, WEEK)).status).toBe(200);
			// A Monday three days ahead, so the store's own clock (Convex reads the real one) is past its notice period.
			const from = NOW + 3 * DAY;
			const to = from + 7 * DAY;
			const first = await previewAndPublic(w.ids.dora, from, to);
			expect(first.preview.length).toBeGreaterThan(0);
			expect(first.preview).toEqual(first.offered);
			const closed = localDate(from + 2 * DAY);
			const saturday = [0, 1, 2, 3, 4, 5, 6]
				.map((i) => from + i * DAY)
				.find((t) => new Date(t).getUTCDay() === 6);
			if (saturday === undefined) throw new Error("no Saturday");
			await as("olga", "POST", "/availability/one-offs", {
				personIds: [w.ids.dora],
				entry: { from: closed, kind: "closed" },
			});
			await as("olga", "POST", "/availability/one-offs", {
				personIds: [w.ids.dora],
				entry: { from: localDate(saturday), kind: "open", start: 600, end: 780 },
			});
			const after = await previewAndPublic(w.ids.dora, from, to);
			expect(after.preview).toEqual(after.offered);
			expect(after.raw.slots.some((s) => localDate(s.start) === closed)).toBe(false);
			expect(after.raw.slots.some((s) => localDate(s.start) === localDate(saturday))).toBe(true);
		});

		it("keeps 09:00 at 09:00 across the spring change, in the preview and on the site alike", async () => {
			w.clock.now = Date.UTC(2027, 2, 24, 8, 0, 0);
			try {
				const daily = [1, 2, 3, 4, 5, 6, 7].map((d) => rule(d, 540, 720));
				expect((await put("olga", w.ids.dora, daily)).status).toBe(200);
				const from = Date.UTC(2027, 2, 26, 0, 0, 0);
				const to = from + 5 * DAY;
				const out = await previewAndPublic(w.ids.dora, from, to);
				expect(out.preview).toEqual(out.offered);
				// The Convex store counts its horizon from the real clock, which is months before this week: the two
				// answers are equal there (above), and the wall-clock hours are asserted where the clock is the world's.
				if (adapter === "convex") return;
				const hours = out.raw.slots.map((s) => localHour(s.start));
				expect(Math.min(...hours)).toBe(9);
				expect(Math.max(...hours)).toBeLessThan(12);
				const before = out.raw.slots.find((s) => localDate(s.start) === "2027-03-27");
				const after = out.raw.slots.find((s) => localDate(s.start) === "2027-03-29");
				expect(before && new Date(before.start).getUTCHours()).toBe(7);
				expect(after && new Date(after.start).getUTCHours()).toBe(6);
			} finally {
				w.clock.now = NOW;
			}
		});

		it("refuses a window longer than eight days or the wrong way round, and a person who is not a practitioner", async () => {
			const q = (person: string, from: number, to: number) =>
				as(
					"olga",
					"GET",
					`/people/${person}/availability/preview?service=evaluation&from=${from}&to=${to}`,
				);
			expect((await q(w.ids.dora, NOW, NOW + 9 * DAY)).status).toBe(400);
			expect((await q(w.ids.dora, NOW + DAY, NOW)).status).toBe(400);
			expect((await q(w.ids.mara, NOW, NOW + DAY)).status).toBe(404);
		});
	});

	describe("rooms' closed days", () => {
		const closures = async () =>
			(await as("olga", "GET", `/rooms/${w.ids.room}/closures?from=2026-01-01`)).json.items as {
				id: string;
				date: string;
				start?: number;
			}[];

		it("closes a room for a range and for part of a day, and opens a day again", async () => {
			const r = await as("olga", "POST", `/rooms/${w.ids.room}/closures`, {
				from: "2027-04-01",
				until: "2027-04-02",
			});
			expect(r.status, JSON.stringify(r.json)).toBe(200);
			await as("olga", "POST", `/rooms/${w.ids.room}/closures`, {
				from: "2027-04-05",
				start: 600,
				end: 720,
			});
			const held = await closures();
			expect(
				held.filter((c) => c.date >= "2027-04-01" && c.date <= "2027-04-05").map((c) => c.date),
			).toEqual(["2027-04-01", "2027-04-02", "2027-04-05"]);
			const one = held.find((c) => c.date === "2027-04-02");
			expect((await as("olga", "DELETE", `/rooms/${w.ids.room}/closures/${one?.id}`)).status).toBe(
				200,
			);
			expect((await closures()).some((c) => c.id === one?.id)).toBe(false);
		});

		it("refuses hours the wrong way round, and a room that is not there, writing nothing", async () => {
			const before = await closures();
			const bad = await as("olga", "POST", `/rooms/${w.ids.room}/closures`, {
				from: "2027-04-10",
				start: 720,
				end: 600,
			});
			expect(bad.status).toBe(400);
			expect(
				(await as("olga", "POST", "/rooms/nosuchroom/closures", { from: "2027-04-10" })).status,
			).toBe(404);
			expect(
				(await as("rita", "POST", `/rooms/${w.ids.room}/closures`, { from: "2027-04-10" })).status,
			).toBe(403);
			expect(await closures()).toEqual(before);
		});
	});

	it("journals every change", async () => {
		const actions = (
			(await as("olga", "GET", "/audit?limit=500")).json.items as { action: string }[]
		).map((e) => e.action);
		for (const a of [
			"availability.rules",
			"availability.copy",
			"availability.one_off_add",
			"availability.one_off_remove",
		])
			expect(actions).toContain(a);
	});
});
