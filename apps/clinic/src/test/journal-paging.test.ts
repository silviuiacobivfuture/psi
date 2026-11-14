import { afterEach, describe, expect, it } from "vitest";
import { JOURNAL_PAGE } from "../audit/journal";
import { type Console, MEMBER, startConsole } from "./harness";

/**
 * The journal a page at a time: one page and "Mai multe", which appends the next page (same filters) into the open
 * table and goes with the last page; a row of a later page opens its drawer; a narrowed journal keeps looking.
 */
let c: Console;
afterEach(() => c.close());

const datastar = { headers: { "datastar-request": "true" } };
const rowsOf = (html: string): string[] =>
	[...html.matchAll(/data-audit-row="([^"]+)"/g)].map((x) => x[1] ?? "");
const moreOf = (html: string): string | null => {
	const at = /(\/settings\/audit\/more\?[^'"]*?)(?:'|&#39;)/.exec(html)?.[1];
	return at === undefined ? null : at.replaceAll("&amp;", "&");
};

/** A journal of the seeded events and `n` more (each new client is an event). */
async function withEvents(n: number): Promise<void> {
	c = await startConsole(MEMBER);
	await c.signIn();
	for (let i = 0; i < n; i++)
		await c.port.createClient("psizone", {
			name: `Jurnal Client ${String(i).padStart(3, "0")}`,
			phone: null,
			guardian: null,
		});
}

describe("the journal, a page at a time", () => {
	it("empty: says the journal is empty, with no table and no control", async () => {
		c = await startConsole(MEMBER, { empty: true });
		await c.signIn();
		const html = await (await c.get("/settings/audit")).text();
		expect(rowsOf(html)).toEqual([]);
		expect(html).toContain("Jurnalul e gol");
		expect(moreOf(html)).toBeNull();
		expect(html).not.toContain("<tbody");
	});

	it("one page: every event, its exact count, no control", async () => {
		await withEvents(0);
		const total = (await c.port.audit("psizone")).length;
		expect(total).toBeLessThan(JOURNAL_PAGE);
		const html = await (await c.get("/settings/audit")).text();
		expect(rowsOf(html)).toHaveLength(total);
		expect(html).toContain(`${total} evenimente`);
		expect(moreOf(html)).toBeNull();
	});

	it("many pages: a page and the control; each 'Mai multe' appends the next, the last takes the control away", async () => {
		await withEvents(2 * JOURNAL_PAGE + 5);
		const all = (await c.port.audit("psizone")).map((e) => e.id);
		const first = await (await c.get("/settings/audit")).text();
		expect(rowsOf(first)).toEqual(all.slice(0, JOURNAL_PAGE));
		expect(first).toContain(`${JOURNAL_PAGE} afișate; urmează și altele`);
		let next = moreOf(first);
		const seen = [...rowsOf(first)];
		let answers = 0;
		while (next !== null) {
			const res = await c.get(next, datastar);
			expect(res.headers.get("content-type")).toContain("text/event-stream");
			const body = await res.text();
			expect(body).toContain("selector #audit-rows");
			expect(body).toContain("mode append");
			seen.push(...rowsOf(body));
			next = moreOf(body);
			answers++;
			if (next === null) {
				// The last page: the control is patched to nothing, the count is exact.
				expect(body).toContain('id="audit-more"');
				expect(body).toContain(`${all.length} evenimente`);
			}
		}
		expect(answers).toBe(Math.ceil(all.length / JOURNAL_PAGE) - 1);
		expect(seen).toEqual(all);
	});

	it("a row of a later page opens its drawer", async () => {
		await withEvents(JOURNAL_PAGE + 3);
		const next = moreOf(await (await c.get("/settings/audit")).text());
		expect(next).not.toBeNull();
		const body = await (await c.get(next ?? "", datastar)).text();
		const late = rowsOf(body)[0] ?? "";
		const drawer = /@get\((?:'|&#39;)(\/settings\/audit\/[^'"]+?)(?:'|&#39;)\); setTimeout/.exec(
			body.slice(body.indexOf(`data-audit-row="${late}"`)),
		)?.[1];
		expect(drawer).toContain(`/settings/audit/${late}?from=`);
		const res = await c.get((drawer ?? "").replaceAll("&amp;", "&"), datastar);
		expect(res.status).toBe(200);
		expect(await res.text()).toContain(`Jurnal Client ${String(2).padStart(3, "0")}`);
	});

	it("the control keeps the filters, and a narrowed page holds only matches", async () => {
		await withEvents(2 * JOURNAL_PAGE);
		const html = await (await c.get("/settings/audit?type=client")).text();
		const rows = rowsOf(html);
		const events = await c.port.audit("psizone");
		const clients = events.filter(
			(e) => e.target.startsWith("client") || e.action.startsWith("client"),
		);
		expect(rows.length).toBeGreaterThan(0);
		for (const id of rows) expect(clients.map((e) => e.id)).toContain(id);
		const next = moreOf(html);
		if (next !== null) expect(next).toContain("type=client");
	});

	it("nothing among the newest matches but older events remain: says so and still offers 'Mai multe'", async () => {
		// 5 × 200 events read for one page, none of them by the person asked for; older ones remain.
		await withEvents(1100);
		const html = await (await c.get("/settings/audit?q=Exemplu%2001")).text();
		expect(rowsOf(html)).toEqual([]);
		expect(html).toContain("Niciunul dintre cele mai recente evenimente nu se potrivește");
		expect(moreOf(html)).not.toBeNull();
		expect(html).not.toContain("Niciun eveniment pentru filtrele alese.");
	});

	it("the control is refused to who may not read the journal", async () => {
		c = await startConsole(
			MEMBER,
			{},
			{ [MEMBER.sub]: [{ app: "psizone", roles: ["reception"] }] },
		);
		await c.signIn();
		expect((await c.get("/settings/audit/more?cursor=50&shown=50", datastar)).status).toBe(403);
	});
});
