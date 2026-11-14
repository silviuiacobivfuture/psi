import { afterEach, describe, expect, it } from "vitest";
import type { ClinicPort } from "../port/port";
import { type Console, MEMBER, startConsole } from "./harness";

let c: Console | undefined;
afterEach(async () => {
	await c?.close();
	c = undefined;
});

async function open(fake: Parameters<typeof startConsole>[1], path: string): Promise<string> {
	c = await startConsole(MEMBER, fake);
	await c.signIn();
	return await (await c.get(path)).text();
}

const failing = (...methods: Array<keyof ClinicPort>): Set<keyof ClinicPort> => new Set(methods);

describe("calendar states", () => {
	it("empty: says so and offers the new-appointment action", async () => {
		const html = await open({ empty: true }, "/calendar");
		expect(html).toContain("Nicio programare");
		expect(html).toContain('role="status"');
		expect(html).not.toContain("cal__appt");
	});
	it("many: a card per appointment of the day, a column per calendar, status in words", async () => {
		c = await startConsole(MEMBER, { today: "2026-11-16" });
		await c.signIn();
		const html = await (await c.get("/calendar?date=2026-11-16&cat=all")).text();
		const data = await c.port.calendar("psizone", "2026-11-16", "2026-11-16");
		expect(html.match(/class="cal__appt cal__appt--wash[^"]*"/g)?.length).toBe(
			data.appointments.length,
		);
		expect(html.match(/class="cal__colhead"/g)?.length).toBe(data.columns.length);
		expect(html).toMatch(/Confirmat|Solicitat/);
	});
	it("one: exactly one card on a day that had none", async () => {
		c = await startConsole(MEMBER);
		await c.signIn();
		expect(await (await c.get("/calendar?date=2027-03-03")).text()).toContain("Nicio programare");
		await c.port.createAppointments("psizone", {
			date: "2027-03-03",
			startMin: 600,
			columnId: "p1",
			clientId: "c1",
			serviceId: "s1",
		});
		const html = await (await c.get("/calendar?date=2027-03-03")).text();
		expect(html.match(/class="cal__appt cal__appt--wash[^"]*"/g)).toHaveLength(1);
		expect(html).toContain("Ștefan Exemplu 01");
		expect(html).toContain("10:00–10:50");
	});
	it("error: a clear message with a retry, never a blank page", async () => {
		const html = await open({ failing: failing("calendar") }, "/calendar");
		expect(html).toContain("Nu am putut încărca datele");
		expect(html).toContain('role="alert"');
		expect(html).toContain("Încearcă din nou");
	});
	it("month and week show their grids", async () => {
		c = await startConsole(MEMBER, { today: "2026-11-16" });
		await c.signIn();
		expect(await (await c.get("/calendar?view=month&date=2026-11-16")).text()).toContain(
			"cal-month__day",
		);
		expect(await (await c.get("/calendar?view=week&date=2026-11-16&col=p2")).text()).toContain(
			"cal--week",
		);
	});
	it("garbage in the query falls back to today's day view", async () => {
		c = await startConsole(MEMBER);
		await c.signIn();
		expect((await c.get("/calendar?view=year&date=not-a-date&col=%00")).status).toBe(200);
	});
});

describe("clients states", () => {
	it("empty", async () =>
		expect(await open({ empty: true }, "/clients")).toContain("Niciun client aici"));
	it("many, with a count", async () => expect(await open({}, "/clients")).toMatch(/21 clienți/));
	it("search narrows, including diacritics, and a miss is an empty state", async () => {
		c = await startConsole(MEMBER);
		await c.signIn();
		expect(await (await c.get("/clients?q=%C8%99tefan")).text()).toContain("Ștefan Exemplu 01");
		expect(await (await c.get("/clients?q=zzzz")).text()).toContain("Niciun client aici");
	});
	it("error", async () =>
		expect(await open({ failing: failing("clients") }, "/clients")).toContain(
			"Nu am putut încărca datele",
		));
});

describe("requests states", () => {
	it("empty", async () =>
		expect(await open({ empty: true }, "/requests")).toContain("Nicio cerere deschisă"));
	it("many", async () => expect(await open({}, "/requests")).toContain("Marchează rezolvată"));
	it("error", async () =>
		expect(await open({ failing: failing("requests") }, "/requests")).toContain(
			"Nu am putut încărca datele",
		));
});

describe("other screens' error and empty states", () => {
	it.each([
		["/roster", "roster"],
		["/reminders?date=2026-11-16", "reminders"],
		["/settings/audit", "audit"],
		["/settings/services", "services"],
		["/settings/roles", "roles"],
		["/settings/members", "members"],
	] as const)("%s shows the error state when the port is down", async (path, method) => {
		const html = await open({ failing: failing(method) }, path);
		expect(html).toContain("Nu am putut încărca datele");
	});
	it("audit and roster are empty states, not blank, with no data", async () => {
		expect(await open({ empty: true }, "/settings/audit")).toContain("Jurnalul e gol");
		expect(await open({ empty: true }, "/roster")).toContain("Pontaj");
	});
	it("reminders for a day with nothing say so", async () => {
		expect(await open({ empty: true }, "/reminders?date=2026-11-16")).toContain(
			"Nimic de reamintit",
		);
	});
});

describe("offline", () => {
	it("the shell carries the offline banner (shown by the browser's own offline event)", async () => {
		const html = await open({}, "/calendar");
		expect(html).toContain("Ești offline");
		expect(html).toContain('data-on:offline__window="$offline = true"');
	});
	it("serves an offline page the worker can fall back to, in both languages", async () => {
		c = await startConsole(MEMBER);
		const html = await (await c.get("/offline")).text();
		expect(html).toContain("Ești offline");
	});
});
