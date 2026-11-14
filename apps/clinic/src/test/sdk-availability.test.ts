import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays } from "../lib/dates";
import { instantOf } from "../port/sdk/time";
import { fieldsOf, formHtml, textOf } from "./availability-kit";
import { type SdkConsole, type Session, startSdkConsole } from "./sdk-harness";

/**
 * Setări → Program and Programări online against the real scheduling service in-process (its in-memory store, its own
 * slot code): the week the console previews is the very set of times the public site is offered, a weekly plan refused
 * by the service comes back with its problems beside the rows, and a pause shows the notice on every screen.
 */
let k: SdkConsole;
let olga: Session;
const FORM = { "content-type": "application/x-www-form-urlencoded" };
const ZONE = "Europe/Bucharest";
/** The week after the service's clock (13 November 2026): every time in it is still to come. */
const WEEK = "2026-11-16";

beforeAll(async () => {
	k = await startSdkConsole();
	olga = await k.as("olga");
});
afterAll(async () => {
	await k.close();
});

const post = (s: Session, path: string, values: ReadonlyArray<[string, string]>) =>
	s.post(path, new URLSearchParams([...values]), FORM);

describe("the preview is what the public site offers", () => {
	it("shows exactly the free times the site's own slot route gives for that practitioner", async () => {
		const dora = k.api.world.ids.dora;
		const html = await (
			await olga.get(`/settings/hours?person=${dora}&service=evaluation&week=${WEEK}`)
		).text();
		const shown = [...html.matchAll(/data-slot="(\d+)"/g)].map((x) => Number(x[1]));
		// Asked a day at a time: the site's answer is bounded, and both practitioners share it.
		const offered: number[] = [];
		for (let i = 0; i < 7; i += 1) {
			const from = instantOf(addDays(WEEK, i), 0, ZONE);
			const to = instantOf(addDays(WEEK, i + 1), 0, ZONE);
			const site = await k.api.world.callKey(
				"psizone-web",
				"GET",
				`/v1/apps/psizone/book/slots?service=evaluation&from=${from}&to=${to}&limit=200`,
				undefined,
				{ "x-psi-client-ip": "203.0.113.11" },
			);
			expect(site.status).toBe(200);
			const slots = site.json.slots as { practitioner: string; start: number }[];
			expect(slots.length).toBeLessThan(90);
			offered.push(...slots.filter((s) => s.practitioner === dora).map((s) => s.start));
		}
		expect(shown.length).toBeGreaterThan(0);
		expect([...new Set(shown)].sort()).toEqual([...new Set(offered)].sort());
		expect(textOf(html)).toContain("Durata ședinței: 60 min.");
	});

	it("saves a split day through the service, and the preview follows it", async () => {
		const dora = k.api.world.ids.dora;
		const path = `/settings/hours/${dora}/rules`;
		const fields: Array<[string, string]> = [
			["s0.from", ""],
			["s0.until", ""],
			["s0.week", ""],
			["s0.override", ""],
			...[1, 2, 3, 4, 5].flatMap(
				(d, i): Array<[string, string]> => [
					[`s0.r${i * 2}.d`, String(d)],
					[`s0.r${i * 2}.start`, "09:00"],
					[`s0.r${i * 2}.end`, "13:00"],
					[`s0.r${i * 2}.onsite`, "1"],
					[`s0.r${i * 2 + 1}.d`, String(d)],
					[`s0.r${i * 2 + 1}.start`, "15:00"],
					[`s0.r${i * 2 + 1}.end`, "19:00"],
					[`s0.r${i * 2 + 1}.online`, "1"],
				],
			),
			["op", "save"],
		];
		const res = await post(olga, path, fields);
		expect(textOf(await res.text())).toContain("Programul a fost salvat.");
		const saved = await k.api.world.call(
			"olga",
			"GET",
			`/v1/apps/psizone/people/${dora}/availability?from=2026-01-01`,
		);
		expect((saved.json.rules as unknown[]).length).toBe(10);
		const html = await (
			await olga.get(`/settings/hours?person=${dora}&service=evaluation&week=${WEEK}`)
		).text();
		const hours = [...html.matchAll(/data-slot="(\d+)"/g)].map((x) =>
			Number(
				new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, hour: "2-digit", hour12: false }).format(
					new Date(Number(x[1])),
				),
			),
		);
		expect(hours.length).toBeGreaterThan(0);
		expect(hours.every((h) => (h >= 9 && h < 13) || (h >= 15 && h < 19))).toBe(true);
	});

	it("shows the service's refusal of an overlap beside the row, and the service keeps what it had", async () => {
		const dora = k.api.world.ids.dora;
		const before = (
			await k.api.world.call(
				"olga",
				"GET",
				`/v1/apps/psizone/people/${dora}/availability?from=2026-01-01`,
			)
		).json.rules;
		const res = await post(olga, `/settings/hours/${dora}/rules`, [
			["s0.from", ""],
			["s0.until", ""],
			["s0.week", ""],
			["s0.override", ""],
			["s0.r0.d", "1"],
			["s0.r0.start", "09:00"],
			["s0.r0.end", "13:00"],
			["s0.r0.onsite", "1"],
			["s0.r1.d", "1"],
			["s0.r1.start", "12:00"],
			["s0.r1.end", "14:00"],
			["s0.r1.onsite", "1"],
			["op", "save"],
		]);
		expect(res.status).toBe(400);
		const html = await res.text();
		const row = html.slice(html.indexOf('data-row="s0.r1"'));
		expect(textOf(row.slice(0, row.indexOf("av-day__add")))).toContain(
			"Se suprapune cu alt interval din aceeași zi.",
		);
		const after = (
			await k.api.world.call(
				"olga",
				"GET",
				`/v1/apps/psizone/people/${dora}/availability?from=2026-01-01`,
			)
		).json.rules;
		expect(after).toEqual(before);
	});

	it("a therapist sees and edits only their own hours", async () => {
		const dora = await k.as("dora");
		const html = await (await dora.get("/settings/hours")).text();
		expect(html).toContain(`action="/settings/hours/${k.api.world.ids.dora}/rules"`);
		expect(html).not.toContain(`/settings/hours/${k.api.world.ids.elena}/rules`);
	});
});

describe("a pause of online booking, through the service", () => {
	it("is made from the page and shows the notice to everyone, the site refusing to book", async () => {
		const editor = await (await olga.get("/settings/online?new=1")).text();
		const res = await post(
			olga,
			"/settings/online/pauses",
			fieldsOf(formHtml(editor, "/settings/online/pauses")),
		);
		expect(textOf(await res.text())).toContain("Programările online au fost oprite.");
		const calendar = await (await olga.get("/calendar")).text();
		expect(calendar).toContain("data-pause-banner");
		expect(textOf(calendar)).toContain("Programările online sunt oprite pentru toată organizația.");
		const rita = await k.as("rita");
		expect(await (await rita.get("/calendar")).text()).toContain("data-pause-banner");
		const from = instantOf(WEEK, 0, ZONE);
		const site = await k.api.world.callKey(
			"psizone-web",
			"GET",
			`/v1/apps/psizone/book/slots?service=evaluation&from=${from}&to=${from + 86_400_000}&limit=20`,
			undefined,
			{ "x-psi-client-ip": "203.0.113.11" },
		);
		expect(site.status).toBe(409);
		const list = await (await olga.get("/settings/online")).text();
		const id = /data-pause="([^"]+)"/.exec(list)?.[1] ?? "";
		await post(olga, `/settings/online/pauses/${id}/remove`, []);
		expect(await (await olga.get("/calendar")).text()).not.toContain("data-pause-banner");
	});
});
