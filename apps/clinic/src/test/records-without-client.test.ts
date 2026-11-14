import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Console, MEMBER, startConsole } from "./harness";

/**
 * The reports that belong to no client: the "Fără client" group, for someone who reads records across the whole app
 * (the owner), and nowhere for a therapist (assigned scope) or reception (no clinical scope). The synthetic clinic holds
 * one such report, `r3`, beside the client c1's own `r1` and `r2`.
 */
const as = async (role: string): Promise<Console> => {
	const c = await startConsole(
		MEMBER,
		{ today: "2026-11-16" },
		{ [MEMBER.sub]: [{ app: "psizone", roles: [role] }] },
	);
	await c.signIn();
	return c;
};
const text = async (c: Console, path: string): Promise<string> => await (await c.get(path)).text();

describe("with the app-wide clinical scope (owner)", () => {
	let c: Console;
	beforeAll(async () => {
		c = await as("owner");
	});
	afterAll(() => c.close());

	it("lists the report of no client under 'Fără client', and no client's report", async () => {
		const res = await c.get("/records");
		expect(res.status).toBe(200);
		const page = await res.text();
		expect(page).toContain("Rapoarte fără client");
		expect(page).toContain('data-group="without-client"');
		expect(page).toContain("Fără client (1)");
		expect(page).toContain('data-record="r3"');
		expect(page).toContain('href="/records/r3"');
		expect(page).not.toContain('data-record="r1"');
		expect(page).not.toContain('data-record="r2"');
	});

	it("opens it to read: its answers, nothing to edit", async () => {
		const res = await c.get("/records/r3");
		expect(res.status).toBe(200);
		const page = await res.text();
		expect(page).toContain("Raport fără client, sintetic.");
		expect(page).toContain("Fără client");
		expect(page).not.toContain('data-action="record.save"');
		expect(page).not.toContain('data-form="record"');
	});

	it("never opens a client's record there, nor an unknown one", async () => {
		expect((await c.get("/records/r1")).status).toBe(404);
		expect((await c.get("/records/nope")).status).toBe(404);
	});

	it("is not on any client's page, and a client's URL does not open it", async () => {
		const records = await text(c, "/clients/c1/records");
		expect(records).toContain('data-record="r1"');
		expect(records).not.toContain('data-record="r3"');
		expect((await c.get("/clients/c1/records/r3")).status).toBe(404);
	});

	it("is offered on the 'More' screen", async () => {
		expect(await text(c, "/more")).toContain('data-more="/records"');
	});

	it("reads 'Without a client' in English", async () => {
		await c.post("/prefs", new URLSearchParams({ lang: "en", theme: "light" }), {
			"content-type": "application/x-www-form-urlencoded",
		});
		const page = await text(c, "/records");
		expect(page).toContain("Reports without a client");
		expect(page).toContain("Without a client (1)");
		expect(page).not.toContain("Fără client");
	});
});

describe.each(["therapist", "reception"])("without it (%s)", (role) => {
	let c: Console;
	beforeAll(async () => {
		c = await as(role);
	});
	afterAll(() => c.close());

	it("refuses the page and the report, and shows neither the group nor the report", async () => {
		for (const path of ["/records", "/records/r3"]) {
			const res = await c.get(path);
			expect(res.status).toBe(403);
			const page = await res.text();
			expect(page).not.toContain('data-group="without-client"');
			expect(page).not.toContain("Raport fără client, sintetic.");
		}
	});

	it("does not offer it on the 'More' screen", async () => {
		expect(await text(c, "/more")).not.toContain('data-more="/records"');
	});
});
