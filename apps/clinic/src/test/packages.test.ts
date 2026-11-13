import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Console, MEMBER, startConsole } from "./harness";

let c: Console;
beforeEach(async () => {
	c = await startConsole(MEMBER);
	await c.signIn();
});
afterEach(() => c.close());

const signals = (fields: Partial<Record<string, string | number>>): string =>
	JSON.stringify({
		pk: {
			k1: {
				name: "Abonament 10 ședințe",
				sessions: 10,
				bonus: 1,
				used: 1,
				total: "1350,00",
				paid: "350,00",
				note: "",
				...fields,
			},
		},
	});

const post = (action: "calc" | "save", body: string) =>
	c.post(`/clients/c1/packages/k1/${action}`, body, {
		"content-type": "application/json",
		"datastar-request": "true",
	});

describe("the packages page", () => {
	it("opens each package on the client's own page with total, paid and remaining", async () => {
		const html = await (await c.get("/clients/c1/packages")).text();
		expect(html).toContain("Abonament 10 ședințe");
		expect(html).toContain('data-testid="remaining"');
		expect(html).toContain("Rămas de plată");
		expect(html).toContain("Preț total");
		expect(html).toContain("Plătit (lei)");
	});
	it("says plainly when the client has none", async () => {
		expect(await (await c.get("/clients/c8/packages")).text()).toContain(
			"Clientul nu are abonamente.",
		);
	});
});

describe("the live calculation (what the page patches in as you type)", () => {
	it.each([
		["nothing paid", "0", "1.350,00", "unpaid"],
		["partly paid", "350", "1.000,00", "partial"],
		["paid in full", "1350,00", "0,00", "paid"],
		["overpaid by a ban", "1350,01", "0,00", "overpaid"],
		["overpaid by a lot", "2000", "0,00", "overpaid"],
	])("%s", async (_name, paid, remaining, state) => {
		const res = await post("calc", signals({ paid }));
		const body = await res.text();
		expect(body).toContain(`data-state="${state}"`);
		expect(body).toContain("pk-k1-summary");
		expect(body).toContain(
			remaining.replace(/\./g, " ").length > 0
				? (remaining.split(",")[0]?.replace(".", ".") ?? "")
				: "",
		);
	});

	it("patches nothing for an amount that cannot be read, and never throws", async () => {
		for (const paid of ["", "abc", "-1", "💸"]) {
			const res = await post("calc", signals({ paid }));
			expect(res.status).toBe(200);
			expect(await res.text()).not.toContain("pk-k1-summary");
		}
	});

	it("is pure: calculating never changes the stored package", async () => {
		const before = await c.port.packages("psizone", "c1");
		await post("calc", signals({ paid: "1350" }));
		expect(await c.port.packages("psizone", "c1")).toEqual(before);
	});
});

describe("saving a package", () => {
	it("stores integer bani, the sessions and a note with unicode intact", async () => {
		const note = "Notă: plătit în două tranșe — ăîâșț 🙂 «test»";
		const res = await post(
			"save",
			signals({ total: "1.500,50", paid: "500", note, bonus: 2, used: 3 }),
		);
		expect(await res.text()).toContain("Abonamentul a fost salvat.");
		const [pkg] = await c.port.packages("psizone", "c1");
		expect(pkg).toMatchObject({ totalBani: 150050, paidBani: 50000, bonus: 2, used: 3, note });
		expect((await c.port.audit("psizone"))[0]?.action).toBe("package.save");
	});

	it("refuses an unreadable amount: nothing is written and the person is told", async () => {
		const before = await c.port.packages("psizone", "c1");
		const auditBefore = (await c.port.audit("psizone")).length;
		const body = await (await post("save", signals({ paid: "mult" }))).text();
		expect(body).toContain("Scrie o sumă");
		expect(await c.port.packages("psizone", "c1")).toEqual(before);
		expect((await c.port.audit("psizone")).length).toBe(auditBefore);
	});

	it("refuses a body that is not the form's signals", async () => {
		const before = await c.port.packages("psizone", "c1");
		const body = await (await post("save", JSON.stringify({ pk: { k1: { name: 5 } } }))).text();
		expect(body).toContain("Scrie o sumă");
		expect(await c.port.packages("psizone", "c1")).toEqual(before);
	});

	it("does not touch another client's package", async () => {
		const other = await c.port.packages("psizone", "c2");
		await post("save", signals({ total: "1", paid: "1" }));
		expect(await c.port.packages("psizone", "c2")).toEqual(other);
	});
});
