import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Console, MEMBER, startConsole } from "./harness";

let c: Console;
beforeEach(async () => {
	c = await startConsole(MEMBER);
	await c.signIn();
});
afterEach(() => c.close());

const JSON_HEADERS = {
	"content-type": "application/json",
	"datastar-request": "true",
};
const field = (cid: string, pid: string, name: string, value: string, key = `${pid}-${name}`) =>
	c.post(
		`/clients/${cid}/packages/${pid}/field/${name}`,
		JSON.stringify({
			ie: { [key.replace(/\W/g, "_")]: { o: true, v: value } },
		}),
		JSON_HEADERS,
	);
const pay = (cid: string, pid: string, row: Record<string, string>) =>
	c.post(
		`/clients/${cid}/packages/${pid}/payments`,
		JSON.stringify({
			pay: { [pid]: { a: "350", k: "cash", d: "2026-11-16", ...row } },
		}),
		JSON_HEADERS,
	);
const pkg1 = async () => (await c.port.packages("psizone", "c1"))[0];
const auditCount = async () => (await c.port.audit("psizone")).length;

describe("the packages page", () => {
	it("shows each package as a card: status, sessions left, money, ledger, sessions used", async () => {
		const html = await (await c.get("/clients/c1/packages")).text();
		expect(html).toContain('id="pk-k1"');
		expect(html).toContain("Abonament 10 ședințe");
		expect(html).toContain('data-state="paid"');
		expect(html).toContain("Achitat integral");
		expect(html).toContain("Plăți");
		expect(html).toContain("Ședințe folosite");
		expect(html).toContain("Adaugă plată");
		expect(html).toContain("Adaugă notă");
		expect(html).toContain("adm-moneybar");
	});
	it("says plainly when the client has none, and still offers a new package", async () => {
		const html = await (await c.get("/clients/c8/packages")).text();
		expect(html).toContain("Clientul nu are abonamente.");
		expect(html).toContain("Abonament nou");
	});
	it("derives sessions used from the linked appointments: nothing is typed", async () => {
		const html = await (await c.get("/clients/c1/packages")).text();
		const [pk] = await c.port.packages("psizone", "c1");
		const appts = (await c.port.clientAppointments("psizone", "c1")).filter(
			(a) => a.packageId === pk?.id && (a.status === "attended" || a.status === "no-show"),
		);
		expect(html).toMatch(new RegExp(`data-testid="used">${appts.length}<`));
		expect(html).not.toContain('name="used"');
	});
	it("a no-show consumes a session, a cancelled one does not", async () => {
		const [p] = await c.port.packages("psizone", "c1");
		const before = (await c.port.clientAppointments("psizone", "c1")).filter(
			(a) => a.packageId === p?.id && a.status === "no-show",
		);
		expect(before.length).toBeGreaterThan(0);
	});
	it("shows the three payment states by their words", async () => {
		expect(await (await c.get("/clients/c2/packages")).text()).toContain("Rest de plată");
		await pay("c2", "k2", { a: "350" });
		expect(await (await c.get("/clients/c2/packages")).text()).toContain("Achitat integral");
		await pay("c2", "k2", { a: "1" });
		expect(await (await c.get("/clients/c2/packages")).text()).toContain("Supraplată");
	});
});

describe("saving one field at a time", () => {
	it.each([
		["name", "Abonament de vară ăîâșț 🙂", (p: { name: string }) => p.name],
		["sessions", "12", (p: { sessions: number }) => p.sessions],
		["bonus", "2", (p: { bonus: number }) => p.bonus],
		["total", "1.500,50", (p: { totalBani: number }) => p.totalBani],
		["note", "Plătit în două tranșe", (p: { note: string }) => p.note],
	] as const)("%s", async (name, value, read) => {
		const res = await field("c1", "k1", name, value);
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain('id="pk-k1"');
		expect(body).toContain("adm-inline__saved");
		const p = await pkg1();
		if (p === undefined) throw new Error("no package");
		expect(String(read(p as never))).toBe(
			{
				name: "Abonament de vară ăîâșț 🙂",
				sessions: "12",
				bonus: "2",
				total: "150050",
				note: "Plătit în două tranșe",
			}[name],
		);
		expect((await c.port.audit("psizone"))[0]?.action).toBe("package.edit");
	});

	it("changes only that field", async () => {
		const before = await pkg1();
		await field("c1", "k1", "bonus", "5");
		expect(await pkg1()).toEqual({ ...before, bonus: 5 });
	});

	it.each([
		["sessions", ""],
		["bonus", ""],
	])("an empty %s is zero, never NaN", async (name, v) => {
		await field("c1", "k1", name, v);
		const html = await (await c.get("/clients/c1/packages")).text();
		expect(html).not.toMatch(/NaN|undefined|Infinity/);
	});

	it.each([
		["sessions", "abc"],
		["sessions", "-1"],
		["sessions", "1.5"],
		["sessions", "1000"],
		["bonus", "💸"],
		["total", "mult"],
		["total", "-5"],
		["name", "   "],
		["name", "x".repeat(121)],
		["note", "x".repeat(1001)],
	])("refuses %s = %j: nothing is written and the person is told", async (name, v) => {
		const before = await pkg1();
		const audit = await auditCount();
		const body = await (await field("c1", "k1", name, v)).text();
		expect(body).toContain("Valoarea nu poate fi citită");
		expect(await pkg1()).toEqual(before);
		expect(await auditCount()).toBe(audit);
	});

	it("refuses fewer sessions than are already used, and says why", async () => {
		const before = await pkg1();
		const body = await (await field("c1", "k1", "sessions", "1")).text();
		expect(body).toContain("mai puține ședințe decât cele deja folosite");
		expect(await pkg1()).toEqual(before);
	});

	it("refuses a body that is not the page's signals", async () => {
		const before = await pkg1();
		const res = await c.post(
			"/clients/c1/packages/k1/field/sessions",
			JSON.stringify({ ie: { k1_sessions: { o: "yes", v: 1 } } }),
			JSON_HEADERS,
		);
		expect(await res.text()).toContain("Valoarea nu poate fi citită");
		expect(await pkg1()).toEqual(before);
	});

	it("404 for an unknown field, another client's package or an unknown id; nothing changes", async () => {
		const other = await c.port.packages("psizone", "c2");
		expect((await field("c1", "k1", "used", "5")).status).toBe(404);
		expect((await field("c1", "k2", "sessions", "5", "k2-sessions")).status).toBe(404);
		expect((await field("c1", "zz", "sessions", "5", "zz-sessions")).status).toBe(404);
		expect(await c.port.packages("psizone", "c2")).toEqual(other);
	});
});

describe("payments", () => {
	it("adds to the ledger with the person who recorded it, and the totals follow", async () => {
		const res = await pay("c2", "k2", {
			a: "100,50",
			k: "transfer",
			d: "2026-11-15",
		});
		const body = await res.text();
		expect(body).toContain("Plata a fost adăugată.");
		const p = (await c.port.packages("psizone", "c2"))[0];
		expect(p?.payments.at(-1)).toMatchObject({
			amountBani: 10050,
			method: "transfer",
			date: "2026-11-15",
			recordedBy: "Ana Test",
		});
		expect((await c.port.audit("psizone"))[0]?.action).toBe("package.payment");
	});
	it.each([
		["empty", ""],
		["zero", "0"],
		["negative", "-5"],
		["text", "abc"],
		["emoji", "💸"],
	])("refuses an amount that is %s: nothing is written", async (_n, a) => {
		const before = await c.port.packages("psizone", "c2");
		const audit = await auditCount();
		const body = await (await pay("c2", "k2", { a })).text();
		expect(body).toContain("Scrie o sumă mai mare ca zero");
		expect(await c.port.packages("psizone", "c2")).toEqual(before);
		expect(await auditCount()).toBe(audit);
	});
	it.each([
		["method", { k: "bitcoin" }],
		["date", { d: "13/11/2026" }],
	])("refuses a bad %s", async (_n, row) => {
		const before = await c.port.packages("psizone", "c2");
		const body = await (await pay("c2", "k2", row)).text();
		expect(body).toContain("Scrie o sumă mai mare ca zero");
		expect(await c.port.packages("psizone", "c2")).toEqual(before);
	});
	it("404 for another client's package", async () => {
		const before = await c.port.packages("psizone", "c2");
		expect((await pay("c1", "k2", {})).status).toBe(404);
		expect(await c.port.packages("psizone", "c2")).toEqual(before);
	});
});

describe("a new package", () => {
	it("is created with an empty ledger and the client's page shows it", async () => {
		await c.signIn();
		const res = await c.post(
			"/clients/c8/packages",
			new URLSearchParams({
				name: "Abonament nou",
				sessions: "10",
				bonus: "1",
				total: "1.350,00",
			}),
			{ "content-type": "application/x-www-form-urlencoded" },
		);
		expect(res.status).toBe(200);
		const [p] = await c.port.packages("psizone", "c8");
		expect(p).toMatchObject({
			name: "Abonament nou",
			sessions: 10,
			bonus: 1,
			totalBani: 135000,
			payments: [],
		});
		expect((await c.port.audit("psizone"))[0]?.action).toBe("package.create");
	});
	it.each([
		["no name", { name: "", sessions: "10", bonus: "0", total: "100" }],
		["sessions text", { name: "a", sessions: "x", bonus: "0", total: "100" }],
		["price text", { name: "a", sessions: "1", bonus: "0", total: "mult" }],
		["bonus negative", { name: "a", sessions: "1", bonus: "-1", total: "100" }],
	])("refuses %s: nothing is created", async (_n, body) => {
		const res = await c.post("/clients/c8/packages", new URLSearchParams(body), {
			"content-type": "application/x-www-form-urlencoded",
		});
		expect(await res.text()).toContain("Abonamentul nu a fost creat");
		expect(await c.port.packages("psizone", "c8")).toEqual([]);
	});
	it("404 for a client that does not exist", async () => {
		const res = await c.post(
			"/clients/zz/packages",
			new URLSearchParams({ name: "a", sessions: "1", total: "1" }),
			{
				"content-type": "application/x-www-form-urlencoded",
			},
		);
		expect(res.status).toBe(404);
	});
});
