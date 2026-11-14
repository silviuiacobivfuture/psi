import { afterEach, describe, expect, it } from "vitest";
import { runAction } from "../actions/engine";
import type { ActionCtx } from "../actions/types";
import { planReasonText } from "../lib/availability-words";
import { canOf } from "../lib/can";
import { createFakePort } from "../port/fake";
import { consoleAs, send, textOf } from "./availability-kit";
import type { Console } from "./harness";

/**
 * One-off days of a practitioner (closed all day, closed part of the day, extra hours; a date or a range; one person or
 * several) and the rooms' closures, through Setări → Program on the fake clinic: added, removed, and every refusal
 * reason in Romanian with nothing written.
 */
let c: Console;
afterEach(async () => {
	await c?.close();
});

const ADD = "/settings/hours/p2/one-offs";
const daysOf = async (person: string) =>
	(await c.port.availability("psizone", person, "2000-01-01")).exceptions;
const entry = (values: Record<string, string>, also: string[] = []): Array<[string, string]> => [
	...Object.entries(values),
	...also.map((id): [string, string] => ["also", id]),
];

describe("one-off days", () => {
	it("closes a date all day, lists it, and removes it again", async () => {
		c = await consoleAs(["owner"]);
		const res = await send(c, ADD, entry({ from: "2026-12-01", kind: "closed-day" }));
		const html = await res.text();
		expect(textOf(html)).toContain("Ziua specială a fost adăugată.");
		const [day] = await daysOf("p2");
		expect(day).toMatchObject({ date: "2026-12-01", kind: "closed" });
		expect(day?.start).toBeUndefined();
		expect(html).toContain(`data-one-off="${day?.id}"`);
		expect(textOf(html)).toContain("Închis toată ziua");
		const removed = await send(c, `/settings/hours/p2/one-offs/${day?.id}/remove`, []);
		expect(textOf(await removed.text())).toContain("Ziua specială a fost ștearsă.");
		expect(await daysOf("p2")).toEqual([]);
		expect((await send(c, `/settings/hours/p2/one-offs/${day?.id}/remove`, [])).status).toBe(404);
	});

	it("closes part of a range of days, for this practitioner and another, all of them at once", async () => {
		c = await consoleAs(["owner"]);
		await send(
			c,
			ADD,
			entry(
				{
					from: "2026-12-07",
					until: "2026-12-09",
					kind: "closed-part",
					start: "12:00",
					end: "14:00",
				},
				["p3"],
			),
		);
		for (const person of ["p2", "p3"]) {
			const days = await daysOf(person);
			expect(days.map((d) => d.date)).toEqual(["2026-12-07", "2026-12-08", "2026-12-09"]);
			expect(days.every((d) => d.kind === "closed" && d.start === 720 && d.end === 840)).toBe(true);
		}
		expect(textOf(await (await c.get("/settings/hours?person=p2")).text())).toContain(
			"Închis 12:00–14:00",
		);
	});

	it("adds extra hours online only", async () => {
		c = await consoleAs(["owner"]);
		const html = await (
			await send(
				c,
				ADD,
				entry({ from: "2026-12-12", kind: "open", start: "10:00", end: "13:00", online: "1" }),
			)
		).text();
		expect(await daysOf("p2")).toMatchObject([
			{ date: "2026-12-12", kind: "open", start: 600, end: 780, modes: ["online"] },
		]);
		expect(textOf(html)).toContain("Ore în plus 10:00–13:00 (online)");
	});

	const refusals: ReadonlyArray<{
		name: string;
		first?: Record<string, string>;
		values: Record<string, string>;
		text: string;
		also?: string[];
	}> = [
		{
			name: "bad_date",
			values: { from: "2026-02-30", kind: "closed-day" },
			text: "Data nu este validă.",
		},
		{
			name: "range_order",
			values: { from: "2026-12-10", until: "2026-12-01", kind: "closed-day" },
			text: "Data de sfârșit este înaintea datei de început.",
		},
		{
			name: "range_too_long",
			values: { from: "2027-01-01", until: "2027-04-03", kind: "closed-day" },
			text: "O perioadă poate avea cel mult 92 de zile.",
		},
		{
			name: "times_pair",
			values: { from: "2026-12-01", kind: "closed-part", start: "10:00" },
			text: "Completează și ora de început, și ora de sfârșit",
		},
		{
			name: "open_needs_hours",
			values: { from: "2026-12-01", kind: "open", onsite: "1" },
			text: "Pentru ore în plus, completează intervalul.",
		},
		{
			name: "end_before_start",
			values: { from: "2026-12-01", kind: "open", start: "14:00", end: "10:00", onsite: "1" },
			text: "Ora de sfârșit trebuie să fie după ora de început.",
		},
		{
			name: "grid",
			values: { from: "2026-12-01", kind: "closed-part", start: "10:02", end: "11:00" },
			text: "Orele merg din 5 în 5 minute",
		},
		{
			name: "no_mode",
			values: { from: "2026-12-01", kind: "open", start: "10:00", end: "11:00" },
			text: "Alege cel puțin un mod",
		},
		{
			name: "dst_gap",
			values: { from: "2027-03-28", kind: "open", start: "03:30", end: "05:00", onsite: "1" },
			text: "Ora aceasta nu există în ziua aleasă",
		},
		{
			name: "duplicate",
			first: { from: "2026-12-01", kind: "closed-day" },
			values: { from: "2026-12-01", kind: "closed-day" },
			text: "Ziua are deja exact această intrare.",
		},
		{
			name: "overlap",
			first: { from: "2026-12-01", kind: "open", start: "18:00", end: "20:00", onsite: "1" },
			values: { from: "2026-12-01", kind: "open", start: "19:00", end: "21:00", onsite: "1" },
			text: "Se suprapune cu o intrare existentă în aceeași zi.",
		},
		{
			name: "day_closed",
			first: { from: "2026-12-01", kind: "closed-day" },
			values: { from: "2026-12-01", kind: "closed-part", start: "10:00", end: "11:00" },
			text: "Ziua este deja închisă toată ziua.",
		},
		{ name: "a date missing", values: { from: "", kind: "closed-day" }, text: "Completează data" },
	];
	it.each(refusals)("refuses $name in Romanian, writing nothing", async ({
		first,
		values,
		text,
	}) => {
		c = await consoleAs(["owner"]);
		if (first !== undefined) await send(c, ADD, entry(first));
		const before = await daysOf("p2");
		const res = await send(c, ADD, entry(values));
		expect(res.status).toBe(400);
		const html = await res.text();
		expect(textOf(html.slice(html.indexOf('action="/settings/hours/p2/one-offs"')))).toContain(
			text,
		);
		expect(await daysOf("p2")).toEqual(before);
		// What was sent stays in the form to correct.
		if (values.from !== "") expect(html).toContain(`name="from" value="${values.from}"`);
	});

	it("names whose day it is when several practitioners were asked, and adds it to none of them", async () => {
		c = await consoleAs(["owner"]);
		await send(c, "/settings/hours/p3/one-offs", entry({ from: "2026-12-02", kind: "closed-day" }));
		const res = await send(c, ADD, entry({ from: "2026-12-02", kind: "closed-day" }, ["p3"]));
		expect(res.status).toBe(400);
		expect(textOf(await res.text())).toContain(
			"Terapeut Gamma: Ziua are deja exact această intrare.",
		);
		expect(await daysOf("p2")).toEqual([]);
		expect(await daysOf("p3")).toHaveLength(1);
	});

	it("too_many: past a thousand one-off days", async () => {
		c = await consoleAs(["owner"]);
		let from = "2030-01-01";
		for (let i = 0; i < 11; i += 1) {
			const start = new Date(`${from}T00:00:00Z`);
			const until = new Date(start.getTime() + 89 * 86_400_000).toISOString().slice(0, 10);
			await c.port.addOneOff("psizone", ["p2"], { from, until, kind: "closed" });
			from = new Date(start.getTime() + 90 * 86_400_000).toISOString().slice(0, 10);
		}
		const before = await daysOf("p2");
		expect(before).toHaveLength(990);
		const res = await send(
			c,
			ADD,
			entry({ from: "2035-01-01", until: "2035-01-20", kind: "closed-day" }),
		);
		expect(res.status).toBe(400);
		expect(textOf(await res.text())).toContain(
			"Sunt prea multe zile speciale păstrate (cel mult 1000)",
		);
		expect(await daysOf("p2")).toHaveLength(990);
	});

	it("is refused to a therapist for someone else's calendar", async () => {
		c = await consoleAs(["therapist"]);
		const res = await send(c, ADD, entry({ from: "2026-12-01", kind: "closed-day" }));
		expect(res.status).toBe(403);
		expect(await daysOf("p2")).toEqual([]);
		await send(c, "/settings/hours/p1/one-offs", entry({ from: "2026-12-01", kind: "closed-day" }));
		expect(await daysOf("p1")).toHaveLength(1);
	});
});

describe("the rooms' closures", () => {
	const ROOM = "/settings/hours/rooms/cabinet-psihoterapie/closures";
	it("closes a room for a range and part of a day, lists it and reopens it", async () => {
		c = await consoleAs(["owner"]);
		const html = await (
			await send(
				c,
				ROOM,
				entry({ from: "2026-12-03", until: "2026-12-04", part: "1", start: "08:00", end: "12:00" }),
			)
		).text();
		expect(textOf(html)).toContain("Cabinetul a fost închis pentru zilele alese.");
		const items = await c.port.roomClosures("psizone", "cabinet-psihoterapie", "2000-01-01");
		expect(items.map((x) => [x.date, x.start, x.end])).toEqual([
			["2026-12-03", 480, 720],
			["2026-12-04", 480, 720],
		]);
		expect(html).toContain(`data-closure="${items[0]?.id}"`);
		await send(c, `${ROOM}/${items[0]?.id}/remove`, []);
		expect(await c.port.roomClosures("psizone", "cabinet-psihoterapie", "2000-01-01")).toHaveLength(
			1,
		);
		expect((await c.port.audit("psizone")).map((e) => e.action)).toEqual(
			expect.arrayContaining(["rooms.closure_add", "rooms.closure_remove"]),
		);
	});

	it("refuses a closure that ends before it starts, writing nothing", async () => {
		c = await consoleAs(["owner"]);
		const res = await send(
			c,
			ROOM,
			entry({ from: "2026-12-03", part: "1", start: "12:00", end: "08:00" }),
		);
		expect(res.status).toBe(400);
		expect(textOf(await res.text())).toContain(
			"Ora de sfârșit trebuie să fie după ora de început.",
		);
		expect(await c.port.roomClosures("psizone", "cabinet-psihoterapie", "2000-01-01")).toEqual([]);
	});

	it("is read only to reception and absent for a therapist", async () => {
		c = await consoleAs(["reception"]);
		const html = await (await c.get("/settings/hours?tab=rooms")).text();
		expect(html).toContain('name="room"');
		expect(html).not.toContain('data-action="rooms.closure_add"');
		expect((await send(c, ROOM, entry({ from: "2026-12-03" }))).status).toBe(403);
		await c.close();
		c = await consoleAs(["therapist"]);
		const own = await (await c.get("/settings/hours?tab=rooms")).text();
		expect(own).not.toContain('name="room"');
		expect(own).toContain('action="/settings/hours/p1/rules"');
	});
});

describe("the refusals the form cannot make, through the action the assistant runs", () => {
	const ctxOf = async (): Promise<ActionCtx> => {
		const port = createFakePort({
			today: "2026-11-16",
			members: { s1: [{ app: "psizone", roles: ["owner"] }] },
		});
		return {
			port,
			app: "psizone",
			can: canOf(await port.capabilities("s1", "psizone"), false),
			actor: { subject: "s1", name: "Ana" },
			locale: "ro",
			today: "2026-11-16",
		};
	};
	it.each([
		[
			"weekday",
			{ weekday: 8, start: 540, end: 600, modes: ["onsite"] },
			"Ziua săptămânii nu este validă.",
		],
		[
			"out_of_day",
			{ weekday: 1, start: 540, end: 1500, modes: ["onsite"] },
			"Orele trebuie să fie între 00:00 și 24:00.",
		],
	] as const)("%s", async (reason, rule, text) => {
		const ctx = await ctxOf();
		const before = (await ctx.port.availability("psizone", "p2", "2000-01-01")).rules;
		const result = await runAction(
			ctx,
			"availability.rules",
			{ person: "p2", rules: [rule] },
			{ confirmed: true },
		);
		expect(result).toMatchObject({
			status: "refused",
			code: "invalid",
			problems: { reason: "plan", problems: [{ reason, index: 0 }] },
		});
		expect(planReasonText(reason, "ro")).toBe(text);
		expect((await ctx.port.availability("psizone", "p2", "2000-01-01")).rules).toEqual(before);
	});
});
