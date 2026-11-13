import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Console, MEMBER, startConsole } from "./harness";

let c: Console;
beforeAll(async () => {
	c = await startConsole(MEMBER, { today: "2026-11-16" });
	await c.signIn();
});
afterAll(() => c.close());

const heads = (html: string): string[] =>
	[...html.matchAll(/class="cal__colhead"[^>]*>(?:.|\n)*?<\/(?:a|div|button)>/g)].map((m) => m[0]);

describe("rooms are a category of their own", () => {
	it("the port knows eleven bookable rooms, each with its category, floor and purpose", async () => {
		const rooms = (await c.port.columns("psizone")).filter((x) => x.kind === "room");
		expect(rooms).toHaveLength(11);
		expect(
			rooms
				.filter((r) => r.category === "neuro")
				.map((r) => r.name)
				.sort(),
		).toEqual(["Mapping cerebral", "Neurofeedback 1", "Neurofeedback 2"]);
		expect(rooms.every((r) => r.floor !== undefined && r.purpose !== undefined)).toBe(true);
	});
	it("the four practitioner-named rooms point at a practitioner of the clinic", async () => {
		const cols = await c.port.columns("psizone");
		const homes = cols.filter((x) => x.homeOf !== undefined);
		expect(homes.map((h) => h.name).sort()).toEqual([
			"Năfureanu Nicoleta",
			"Pavel Irina",
			"Turcu Adrian",
			"Turcu Daniela",
		]);
		for (const h of homes) expect(cols.find((x) => x.id === h.homeOf)?.kind).toBe("person");
	});
	it("a neuro service is only ever booked in a neuro room", async () => {
		const cols = await c.port.columns("psizone");
		const services = await c.port.services("psizone");
		const data = await c.port.calendar("psizone", "2026-11-09", "2026-11-27");
		const neuro = new Set(services.filter((s) => s.roomCategory === "neuro").map((s) => s.id));
		for (const a of data.appointments) {
			const col = cols.find((x) => x.id === a.columnId);
			if (col?.kind === "room" && neuro.has(a.serviceId)) expect(col.category).toBe("neuro");
			if (col?.category === "neuro") expect(neuro.has(a.serviceId)).toBe(true);
		}
	});
	it("the calendar shows the team by default and filters the rooms by category", async () => {
		const day = "/calendar?date=2026-11-16";
		const count = async (q: string): Promise<number> =>
			heads(await (await c.get(`${day}${q}`)).text()).length;
		expect(await count("")).toBe(7);
		expect(await count("&cat=neuro")).toBe(3);
		expect(await count("&cat=therapy")).toBe(8);
		expect(await count("&cat=all")).toBe(18);
	});
	it("the plan has the owner's three floors in order and a legend naming both categories", async () => {
		const html = await (await c.get("/floor")).text();
		const floors = [...html.matchAll(/Parter|Etajul 1|Etajul 2/g)].map((m) => m[0]);
		expect(floors.indexOf("Parter")).toBeLessThan(floors.indexOf("Etajul 1"));
		expect(floors.indexOf("Etajul 1")).toBeLessThan(floors.indexOf("Etajul 2"));
		expect(html).toContain("Psihoterapie, consiliere, logopedie, grup");
		expect(html).toContain("Neuroevaluare și neurofeedback");
		expect(html).toContain('data-category="therapy"');
	});
});
