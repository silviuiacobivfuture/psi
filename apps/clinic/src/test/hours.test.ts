import { afterEach, describe, expect, it } from "vitest";
import { addDays, todayIso, weekStart } from "../lib/dates";
import { instantOf } from "../port/sdk/time";
import {
	consoleAs,
	fieldsOf,
	formHtml,
	rowHtml,
	send,
	textOf,
	withFields,
} from "./availability-kit";
import type { Console } from "./harness";

/**
 * Setări → Program on the fake clinic: who sees what (the Owner every practitioner, a therapist their own, reception
 * read-only, a volunteer nothing), the weekly rules (a split day, the schedules the editor keeps as they are, Monday
 * copied to the working days, intervals added and removed before saving, every refusal reason in Romanian beside its
 * row with nothing written), copying to other practitioners, and the week the site offers.
 */
let c: Console;
afterEach(async () => {
	await c?.close();
});

const RULES = "/settings/hours/p2/rules";
const rulesOf = async (person: string) =>
	(await c.port.availability("psizone", person, "2000-01-01")).rules;
const page = async (path: string): Promise<string> => {
	const res = await c.get(path);
	expect(res.status, path).toBe(200);
	return res.text();
};

/** Monday to Friday 09:00-13:00 and 15:00-19:00 (the split day), both modes: rows s0.r0.. in weekday order. */
const splitWeek = (): Array<[string, string]> =>
	[1, 2, 3, 4, 5].flatMap((d, i) =>
		[
			["09:00", "13:00"],
			["15:00", "19:00"],
		].flatMap(([start = "", end = ""], k) => {
			const key = `s0.r${i * 2 + k}`;
			return [
				[`${key}.d`, String(d)],
				[`${key}.start`, start],
				[`${key}.end`, end],
				[`${key}.onsite`, "1"],
				[`${key}.online`, "1"],
			] as Array<[string, string]>;
		}),
	);
const schedule = (j: number, extra: Record<string, string> = {}): Array<[string, string]> => [
	[`s${j}.from`, extra.from ?? ""],
	[`s${j}.until`, extra.until ?? ""],
	[`s${j}.week`, extra.week ?? ""],
	[`s${j}.override`, extra.override ?? ""],
];
const row = (
	j: number,
	k: number,
	d: number,
	start: string,
	end: string,
	modes = ["onsite", "online"],
) =>
	[
		[`s${j}.r${k}.d`, String(d)],
		[`s${j}.r${k}.start`, start],
		[`s${j}.r${k}.end`, end],
		...modes.map((mode) => [`s${j}.r${k}.${mode}`, "1"]),
	] as Array<[string, string]>;

describe("who sees Setări → Program", () => {
	it("the Owner: every practitioner, editable, with the rooms' tab", async () => {
		c = await consoleAs(["owner"]);
		const html = await page("/settings/hours");
		expect(html).toContain('data-action="availability.rules"');
		expect(html).toContain('name="person"');
		for (const id of ["p1", "p2", "p3", "p4"]) expect(html).toContain(`<option value="${id}"`);
		expect(html).toContain('href="/settings/hours?tab=rooms"');
		expect(html).not.toContain("data-read-only");
		const other = await page("/settings/hours?person=p3");
		expect(other).toContain('action="/settings/hours/p3/rules"');
	});

	it("a therapist: only their own calendar, which they may edit; another's is never shown or saved", async () => {
		c = await consoleAs(["therapist"]);
		const html = await page("/settings/hours?person=p2");
		expect(html).toContain('action="/settings/hours/p1/rules"');
		expect(html).not.toContain('action="/settings/hours/p2/rules"');
		expect(html).not.toContain('<option value="p2"');
		const before = await rulesOf("p2");
		const res = await send(c, RULES, [
			...schedule(0),
			...row(0, 0, 1, "08:00", "09:00"),
			["op", "save"],
		]);
		expect(res.status).toBe(403);
		expect(await rulesOf("p2")).toEqual(before);
		expect((await c.get("/settings/online")).status).toBe(403);
	});

	it("reception: every practitioner, read only; a save is refused before it reaches the service", async () => {
		c = await consoleAs(["reception"]);
		const html = await page("/settings/hours?person=p2");
		expect(html).toContain("data-read-only");
		expect(html).not.toContain('data-action="availability.rules"');
		expect(html).not.toContain('data-action="availability.one_off_add"');
		expect(html).toContain("09:00");
		const before = await rulesOf("p2");
		const res = await send(c, RULES, [
			...schedule(0),
			...row(0, 0, 1, "08:00", "09:00"),
			["op", "save"],
		]);
		expect(res.status).toBe(403);
		expect(await rulesOf("p2")).toEqual(before);
	});

	it("a volunteer (a role with none of it): no access, and no entry in the settings", async () => {
		c = await consoleAs(["volunteer"]);
		expect((await c.get("/settings/hours")).status).toBe(403);
		expect((await c.get("/settings/online")).status).toBe(403);
	});
});

describe("the weekly rules", () => {
	it("saves a split day for each working day, and the page shows it saved", async () => {
		c = await consoleAs(["owner"]);
		const res = await send(c, RULES, [...schedule(0), ...splitWeek(), ["op", "save"]]);
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(textOf(html)).toContain("Programul a fost salvat.");
		const rules = await rulesOf("p2");
		expect(rules).toHaveLength(10);
		expect(rules.filter((r) => r.weekday === 1).map((r) => [r.start, r.end])).toEqual([
			[540, 780],
			[900, 1140],
		]);
		expect(rules.every((r) => r.modes.length === 2)).toBe(true);
		expect((await c.port.audit("psizone")).some((e) => e.action === "availability.rules")).toBe(
			true,
		);
	});

	it("keeps the alternating and period schedules it shows, untouched, when the regular week is saved", async () => {
		c = await consoleAs(["owner"]);
		const html = await page("/settings/hours?person=p1");
		expect(textOf(html)).toContain("Săptămâna A (alternativ)");
		const fields = fieldsOf(formHtml(html, "/settings/hours/p1/rules"));
		const res = await send(c, "/settings/hours/p1/rules", [
			...withFields(fields, { "s0.r0.end": "12:00" }),
			["op", "save"],
		]);
		expect(res.status).toBe(200);
		const rules = await rulesOf("p1");
		expect(rules.find((r) => r.week === "A")).toEqual({
			weekday: 6,
			start: 600,
			end: 780,
			modes: ["onsite"],
			week: "A",
		});
		expect(rules.find((r) => r.weekday === 1 && r.start === 540)?.end).toBe(720);
	});

	it("saves a period schedule that replaces the regular week on its dates, an end of 00:00 being midnight", async () => {
		c = await consoleAs(["owner"]);
		await send(c, RULES, [
			...schedule(0),
			...row(0, 0, 1, "09:00", "17:00"),
			...schedule(1, { from: "2026-12-20", until: "2027-01-05", override: "1" }),
			...row(1, 0, 2, "18:00", "00:00", ["online"]),
			["op", "save"],
		]);
		expect(await rulesOf("p2")).toEqual([
			{ weekday: 1, start: 540, end: 1020, modes: ["onsite", "online"] },
			{
				weekday: 2,
				start: 1080,
				end: 1440,
				modes: ["online"],
				validFrom: "2026-12-20",
				validUntil: "2027-01-05",
				override: true,
			},
		]);
		const html = await page("/settings/hours?person=p2");
		expect(textOf(html)).toContain("Program pe perioadă");
	});

	it("copies Monday to Tuesday-Friday in the form, without saving until Save", async () => {
		c = await consoleAs(["owner"]);
		const before = await rulesOf("p2");
		const res = await send(c, RULES, [
			...schedule(0),
			...row(0, 0, 1, "08:00", "12:00"),
			...row(0, 1, 1, "13:00", "16:00", ["online"]),
			...row(0, 2, 3, "10:00", "11:00"),
			...row(0, 3, 6, "10:00", "12:00"),
			["op", "copy-monday:0"],
		]);
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(await rulesOf("p2")).toEqual(before);
		expect(textOf(html)).toContain("Modificări nesalvate");
		const fields = fieldsOf(formHtml(html, RULES));
		const days = fields.filter(([k]) => /\.d$/.test(k)).map(([, v]) => Number(v));
		expect(days).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6]);
		expect(fields.filter(([k, v]) => k.endsWith(".start") && v === "08:00")).toHaveLength(5);
		expect(fields.filter(([k]) => k.endsWith(".online")).length).toBe(11);
		expect(fields.filter(([k]) => k.endsWith(".onsite")).length).toBe(6);
		await send(c, RULES, [...fields, ["op", "save"]]);
		expect(
			(await rulesOf("p2")).filter((r) => r.weekday === 4).map((r) => [r.start, r.end]),
		).toEqual([
			[480, 720],
			[780, 960],
		]);
	});

	it("adds an interval to a free day and removes one, unsaved", async () => {
		c = await consoleAs(["owner"]);
		const before = await rulesOf("p2");
		const added = await send(c, RULES, [
			...schedule(0),
			...row(0, 0, 1, "09:00", "13:00"),
			["op", "add:0:6"],
		]);
		const fields = fieldsOf(formHtml(await added.text(), RULES));
		expect(fields).toContainEqual(["s0.r1.d", "6"]);
		expect(fields).toContainEqual(["s0.r1.start", "09:00"]);
		const second = fieldsOf(
			formHtml(await (await send(c, RULES, [...fields, ["op", "add:0:6"]])).text(), RULES),
		);
		expect(second).toContainEqual(["s0.r2.d", "6"]);
		expect(second).toContainEqual(["s0.r2.start", ""]);
		const removed = fieldsOf(
			formHtml(await (await send(c, RULES, [...second, ["op", "remove:0:0"]])).text(), RULES),
		);
		expect(removed.filter(([k]) => k.endsWith(".d")).map(([, v]) => v)).toEqual(["6", "6"]);
		expect(await rulesOf("p2")).toEqual(before);
		// The blank interval is left out of the save; the other one is kept.
		await send(c, RULES, [...removed, ["op", "save"]]);
		expect(await rulesOf("p2")).toEqual([
			{ weekday: 6, start: 540, end: 1020, modes: ["onsite", "online"] },
		]);
	});
});

describe("every refusal of the weekly rules, in Romanian beside its row, nothing written", () => {
	const cases: ReadonlyArray<{
		name: string;
		fields: Array<[string, string]>;
		at: string;
		text: string;
	}> = [
		{
			name: "end_before_start",
			fields: [...schedule(0), ...row(0, 0, 1, "13:00", "09:00")],
			at: "s0.r0",
			text: "Ora de sfârșit trebuie să fie după ora de început.",
		},
		{
			name: "grid",
			fields: [...schedule(0), ...row(0, 0, 1, "09:03", "13:00")],
			at: "s0.r0",
			text: "Orele merg din 5 în 5 minute",
		},
		{
			name: "overlap",
			fields: [
				...schedule(0),
				...row(0, 0, 1, "09:00", "13:00"),
				...row(0, 1, 1, "12:00", "14:00"),
			],
			at: "s0.r1",
			text: "Se suprapune cu alt interval din aceeași zi.",
		},
		{
			name: "too_many_intervals",
			fields: [
				...schedule(0),
				...[8, 9, 10, 11, 12, 13, 14].flatMap((h, k) =>
					row(0, k, 2, `${String(h).padStart(2, "0")}:00`, `${String(h).padStart(2, "0")}:30`),
				),
			],
			at: "s0.r6",
			text: "Cel mult 6 intervale într-o zi.",
		},
		{
			name: "no_mode",
			fields: [...schedule(0), ...row(0, 0, 1, "09:00", "13:00", [])],
			at: "s0.r0",
			text: "Alege cel puțin un mod: la cabinet sau online.",
		},
		{
			name: "a time missing",
			fields: [...schedule(0), ...row(0, 0, 1, "09:00", "")],
			at: "s0.r0",
			text: "Completează ora de început și ora de sfârșit.",
		},
	];
	it.each(cases)("$name", async ({ fields, at, text }) => {
		c = await consoleAs(["owner"]);
		const before = await rulesOf("p2");
		const res = await send(c, RULES, [...fields, ["op", "save"]]);
		expect(res.status).toBe(400);
		const html = await res.text();
		expect(textOf(rowHtml(html, at))).toContain(text);
		expect(await rulesOf("p2")).toEqual(before);
		// What was typed is still there to correct.
		expect(fieldsOf(formHtml(html, RULES))).toEqual(
			expect.arrayContaining(fields.filter(([k]) => k.endsWith(".start"))),
		);
	});

	const dated: ReadonlyArray<{ name: string; extra: Record<string, string>; text: string }> = [
		{ name: "bad_date", extra: { from: "2026-02-30" }, text: "Data nu este validă." },
		{
			name: "validity",
			extra: { from: "2026-12-10", until: "2026-12-01" },
			text: "Data de sfârșit este înaintea datei de început.",
		},
		{
			name: "period_start",
			extra: { override: "1" },
			text: "Un program pe perioadă are nevoie de o dată de început.",
		},
	];
	it.each(dated)("$name, on the schedule's dates", async ({ extra, text }) => {
		c = await consoleAs(["owner"]);
		const before = await rulesOf("p2");
		const res = await send(c, RULES, [
			...schedule(0),
			...row(0, 0, 1, "09:00", "13:00"),
			...schedule(1, extra),
			...row(1, 0, 2, "09:00", "13:00"),
			["op", "save"],
		]);
		expect(res.status).toBe(400);
		const html = await res.text();
		const card = html.slice(html.indexOf('data-schedule="1"'));
		expect(textOf(card.slice(0, card.indexOf("av-days")))).toContain(text);
		expect(await rulesOf("p2")).toEqual(before);
	});

	it("too_many: more than 120 intervals, over the whole editor", async () => {
		c = await consoleAs(["owner"]);
		const before = await rulesOf("p2");
		const fields = [0, 1, 2].flatMap((j) => [
			...schedule(j, { from: `202${7 + j}-01-01`, until: `202${7 + j}-12-31` }),
			...[1, 2, 3, 4, 5, 6, 7].flatMap((d, i) =>
				[8, 9, 10, 11, 12, 13].flatMap((h, k) =>
					row(
						j,
						i * 6 + k,
						d,
						`${String(h).padStart(2, "0")}:00`,
						`${String(h).padStart(2, "0")}:30`,
					),
				),
			),
		]);
		const res = await send(c, RULES, [...fields, ["op", "save"]]);
		expect(res.status).toBe(400);
		expect(textOf(await res.text())).toContain("Sunt prea multe intervale: cel mult 120 în total.");
		expect(await rulesOf("p2")).toEqual(before);
	});
});

describe("copying the hours to other practitioners", () => {
	it("gives the chosen ones this practitioner's saved hours, all of them", async () => {
		c = await consoleAs(["owner"]);
		const p1 = await rulesOf("p1");
		const res = await send(c, "/settings/hours/p1/copy", [
			["to", "p2"],
			["to", "p3"],
		]);
		expect(textOf(await res.text())).toContain("Programul a fost aplicat terapeuților aleși.");
		expect(await rulesOf("p2")).toEqual(p1);
		expect(await rulesOf("p3")).toEqual(p1);
		expect(await rulesOf("p4")).not.toEqual(p1);
	});

	it("refuses with nobody chosen, and copies to nobody when one of them is unknown", async () => {
		c = await consoleAs(["owner"]);
		const before = await rulesOf("p2");
		const none = await send(c, "/settings/hours/p1/copy", []);
		expect(none.status).toBe(400);
		expect(textOf(await none.text())).toContain("Alege cel puțin un terapeut.");
		const unknown = await send(c, "/settings/hours/p1/copy", [
			["to", "p2"],
			["to", "nobody"],
		]);
		expect(unknown.status).toBe(404);
		expect(await rulesOf("p2")).toEqual(before);
	});
});

describe("the week the site offers", () => {
	const week = weekStart(addDays(todayIso(), 14));

	it("shows the service's free times per day, its length, and that step and buffers are the service's", async () => {
		c = await consoleAs(["owner"]);
		const html = await page(`/settings/hours?person=p2&service=s1&week=${week}`);
		const shown = [...html.matchAll(/data-slot="(\d+)"/g)].map((x) => Number(x[1]));
		const zone = "Europe/Bucharest";
		const asked = await c.port.availabilityPreview(
			"psizone",
			"p2",
			"s1",
			instantOf(week, 0, zone),
			instantOf(addDays(week, 7), 0, zone),
		);
		expect(shown.length).toBeGreaterThan(0);
		expect(shown).toEqual(asked.slots.map((s) => s.start));
		// Saturday and Sunday are free days for p2: nothing offered then.
		expect(html.slice(html.indexOf(`data-preview-day="${addDays(week, 6)}"`))).toContain(
			"Nimic liber",
		);
		const text = textOf(html);
		expect(text).toContain("Durata ședinței: 50 min.");
		expect(text).toContain("Pasul dintre ore și pauzele dintre ședințe sunt ale serviciului.");
		expect(html).toContain('href="/settings/services"');
		expect(html).not.toContain("data-preview-paused");
	});

	it("loses a day closed by a one-off entry, and says when booking is paused", async () => {
		c = await consoleAs(["owner"]);
		const tuesday = addDays(week, 1);
		await send(c, "/settings/hours/p2/one-offs", [
			["from", tuesday],
			["kind", "closed-day"],
		]);
		const html = await page(`/settings/hours?person=p2&service=s1&week=${week}`);
		expect(
			html.slice(
				html.indexOf(`data-preview-day="${tuesday}"`),
				html.indexOf(`data-preview-day="${addDays(week, 2)}"`),
			),
		).toContain("Nimic liber");
		await c.port.createPause("psizone", {
			scope: { level: "practitioner", practitionerId: "p2" },
			callbacksOpen: true,
			blockStaff: false,
		});
		expect(await page(`/settings/hours?person=p2&service=s1&week=${week}`)).toContain(
			"data-preview-paused",
		);
	});
});
