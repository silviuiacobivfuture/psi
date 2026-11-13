import { afterEach, describe, expect, it } from "vitest";
import { type Console, MEMBER, startConsole } from "./harness";

let c: Console;
afterEach(() => c.close());

const open = async (
	roles: string[] = ["owner"],
	fake: Parameters<typeof startConsole>[1] = { today: "2026-11-16" },
): Promise<void> => {
	c = await startConsole(MEMBER, fake, { [MEMBER.sub]: [{ app: "psizone", roles }] });
	await c.signIn();
};

describe("the statistics screen", () => {
	it("is in the navigation for whoever may see reports, with the KPI tiles, the charts and the tables", async () => {
		await open();
		const html = await (await c.get("/stats?period=month")).text();
		expect(html).toContain('href="/stats"');
		for (const kpi of [
			"today",
			"week",
			"month",
			"appointments",
			"occupancy",
			"cancellations",
			"no-shows",
			"clients",
			"revenue",
			"packages",
			"requests",
		])
			expect(html).toContain(`data-kpi="${kpi}"`);
		expect(html).toContain("Programări pe zile");
		expect((html.match(/<svg class="stat-svg/g) ?? []).length).toBeGreaterThanOrEqual(4);
		// Each chart has its numbers in a table, and a title for assistive technology.
		expect(html).toContain("<caption");
		expect(html).toContain('role="img"');
		expect(html).toContain("Înainte:");
	});

	it("asks for the previous period only when the comparison is on", async () => {
		await open();
		expect(await (await c.get("/stats?compare=0")).text()).not.toContain("Înainte:");
		expect(await (await c.get("/stats?compare=1")).text()).toContain("Înainte:");
	});

	it("drills down to one therapist, whose own figures are the screen's", async () => {
		await open();
		const columns = await c.port.columns("psizone");
		const person = columns.find((x) => x.kind === "person");
		if (person === undefined) throw new Error("the seed has no person column");
		const html = await (await c.get(`/stats?person=${person.id}`)).text();
		expect(html).toContain(`Statistici: ${person.name}`);
		expect(html).toContain("Toată clinica");
		expect(html).not.toContain("Pe terapeut");
		expect((await c.get("/stats?person=nobody")).status).toBe(404);
	});

	it("refuses a period that is not one, and a day that is not a day", async () => {
		await open();
		expect((await c.get("/stats?period=decade")).status).toBe(400);
		expect((await c.get("/stats?period=custom&from=31-12-2026")).status).toBe(400);
	});

	it("says the statistics are not available instead of showing numbers when the service does not serve them", async () => {
		await open(["owner"], { today: "2026-11-16", failing: new Set(["report"]) });
		const res = await c.get("/stats");
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain("Statisticile nu sunt disponibile încă");
		expect(html).not.toContain("data-kpi=");
	});

	it("is closed to whoever holds no reports permission: not in the menu, not reachable", async () => {
		await open(["reception"]);
		expect(await (await c.get("/calendar")).text()).not.toContain('href="/stats"');
		expect((await c.get("/stats")).status).toBe(403);
		expect(await (await c.get("/more")).text()).not.toContain('href="/stats"');
	});

	it("the owner sees the money tile", async () => {
		await open(["owner"]);
		expect(await (await c.get("/stats")).text()).toContain('data-kpi="revenue"');
	});
});
