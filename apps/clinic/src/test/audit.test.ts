import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cell } from "../audit/csv";
import { type Console, MEMBER, startConsole } from "./harness";

let c: Console;
afterEach(() => c.close());

const datastar = { "datastar-request": "true" };
const rowsOf = (html: string): string[] =>
	[...html.matchAll(/data-audit-row="([^"]+)"/g)].map((x) => x[1] ?? "");

describe("the journal", () => {
	beforeEach(async () => {
		c = await startConsole(MEMBER);
		await c.signIn();
	});

	it("says what happened in words, and shows no raw action code in the table", async () => {
		const html = await (await c.get("/audit")).text();
		expect(rowsOf(html)).toHaveLength(12);
		expect(html).toContain("A anulat programarea lui");
		expect(html).toContain("motiv: Clientul a anunțat că e bolnav");
		const table = html.slice(html.indexOf("<tbody"), html.indexOf("</tbody>"));
		expect(table).not.toMatch(/appointment\.|client\.|package\.|reminder\./);
		// Objects are named, never by their ids.
		expect(table).toContain("Matei Exemplu 03");
		expect(table.replace(/<[^>]*>/g, " ")).not.toMatch(/\bc3\b|\ba4\b/);
	});

	it("filters by object type, by person, by action and by day, each leaving the rest out", async () => {
		const clients = rowsOf(await (await c.get("/audit?type=client")).text());
		expect(clients.length).toBeGreaterThan(0);
		expect(clients.length).toBeLessThan(12);
		const one = rowsOf(await (await c.get("/audit?person=Terapeut%20Alfa")).text());
		expect(one.length).toBeGreaterThan(0);
		expect(one.length).toBeLessThan(12);
		const cancels = rowsOf(await (await c.get("/audit?action=appointment_cancel")).text());
		expect(cancels).toEqual(["e2"]);
		const events = await c.port.audit("psizone");
		const day = events[0]?.at.slice(0, 10) ?? "";
		const same = events.filter((e) => e.at.slice(0, 10) === day).length;
		expect(rowsOf(await (await c.get(`/audit?from=${day}&to=${day}`)).text())).toHaveLength(same);
	});

	it("searches the words, accents and case aside, and says so when nothing matches", async () => {
		expect(rowsOf(await (await c.get("/audit?q=RECEPTIE")).text()).length).toBeGreaterThan(0);
		expect(rowsOf(await (await c.get("/audit?q=Tudor")).text())).toContain("e2");
		const none = await (await c.get("/audit?q=zzzzzz")).text();
		expect(rowsOf(none)).toEqual([]);
		expect(none).toContain("Niciun eveniment pentru filtrele alese.");
	});

	it("refuses a filter that is not a value, without listing anything else", async () => {
		const res = await c.get("/audit?from=not-a-day");
		expect(res.status).toBe(400);
		expect(rowsOf(await res.text())).toEqual([]);
	});

	it("opens one event in full: who, when, the object, the before and after, the source, the request", async () => {
		const html = await (await c.get("/audit/e2", { headers: datastar })).text();
		expect(html).toContain("Terapeut Alfa");
		expect(html).toContain("Confirmat");
		expect(html).toContain("Anulat");
		expect(html).toContain("Consolă");
		expect(html).toContain("req-seed-02");
		expect(html).toContain("Clientul a anunțat că e bolnav");
		const assistant = await (await c.get("/audit/e6", { headers: datastar })).text();
		expect(assistant).toContain("Asistent");
		const noted = await (await c.get("/audit/e9", { headers: datastar })).text();
		expect(noted).toContain("Import");
		expect(noted).toContain("Nu a fost înregistrat");
	});

	it("an event that does not exist is a 404 and nothing of it is echoed", async () => {
		const res = await c.get("/audit/nope%27%3Balert(1)", { headers: datastar });
		expect(res.status).toBe(404);
		expect(await res.text()).not.toContain("alert");
	});

	it("exports what the filters show as a CSV, in words", async () => {
		const res = await c.get("/audit/export.csv?type=client");
		expect(res.headers.get("content-type")).toContain("text/csv");
		expect(res.headers.get("content-disposition")).toContain("attachment");
		const bytes = new Uint8Array(await res.clone().arrayBuffer());
		expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
		const text = await res.text();
		expect(text.split("\r\n").length - 2).toBe(
			rowsOf(await (await c.get("/audit?type=client")).text()).length,
		);
		expect(text).not.toContain("appointment.");
	});

	it("a cell a spreadsheet would run as a formula is neutralised", () => {
		expect(cell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
		expect(cell("+1")).toBe("'+1");
		expect(cell("a,b")).toBe('"a,b"');
		expect(cell('say "hi"')).toBe('"say ""hi"""');
		expect(cell("plain")).toBe("plain");
	});
});

describe("who may open the journal", () => {
	it("a receptionist may not open the list, an event or the export", async () => {
		c = await startConsole(
			MEMBER,
			{},
			{ [MEMBER.sub]: [{ app: "psizone", roles: ["reception"] }] },
		);
		await c.signIn();
		for (const path of ["/audit", "/audit/e2", "/audit/export.csv"])
			expect((await c.get(path, { headers: datastar })).status).toBe(403);
	});
});
