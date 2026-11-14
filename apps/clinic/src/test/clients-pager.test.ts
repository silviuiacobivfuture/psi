import { fold } from "@psi/scheduling/clinic";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clientsHref, parseClients } from "../pages/clients-query";
import { type SdkConsole, type Session, startSdkConsole } from "./sdk-harness";

/**
 * The client list's numbered pages over the real service (its in-memory store, the populated clinic plus enough
 * synthetic clients for several pages): what the page shows (rows, "1–50 din N", the pager), the boundaries (empty,
 * one, an exact multiple, the last partial page, past the end), a size change keeping the position, the size kept for
 * the person only when they pick it, the search with the filters and an order, the address round trip, the in-place
 * answer (patches, never an append; the address pushed), and the reach: a therapist's rows and count are their own.
 */
const A = "/v1/apps/psizone";
const DATASTAR = { headers: { "datastar-request": "true" } };
const EXTRA = 100;
let k: SdkConsole;
let olga: Session;
let total = 0;

const rows = (html: string): string[] =>
	[...html.matchAll(/data-client="([^"]+)"/g)].map((x) => x[1] ?? "");
const names = (html: string): string[] =>
	[...html.matchAll(/class="client-row__main"><strong>([^<]+)<\/strong>/g)].map((x) => x[1] ?? "");
const range = (html: string): string => /data-range[^>]*>([^<]+)</.exec(html)?.[1] ?? "";
const current = (html: string): string => /aria-current="page"[^>]*>(\d+)</.exec(html)?.[1] ?? "";
const page = async (s: Session, path: string): Promise<string> => {
	const res = await s.get(path);
	expect(res.status).toBe(200);
	return res.text();
};

beforeAll(async () => {
	k = await startSdkConsole();
	const w = k.api.world;
	for (let i = 0; i < EXTRA; i++) {
		const r = await w.call("olga", "POST", `${A}/clients`, {
			name: `Pagină ${String(i).padStart(3, "0")}`,
			...(i % 3 === 0 ? { treating: [w.ids.dora] } : {}),
		});
		expect(r.status, JSON.stringify(r.json)).toBe(200);
	}
	total = (await w.store.c.clients.list("psizone", { eq: { status: "active" } })).length;
	olga = await k.as("olga");
}, 120_000);
afterAll(() => k.close());

describe("one numbered page at a time", () => {
	it("opens on page one at the default size, the total said and the pager below", async () => {
		const html = await page(olga, "/clients");
		expect(rows(html)).toHaveLength(50);
		expect(range(html)).toBe(`1–50 din ${total}`);
		expect(current(html)).toBe("1");
		expect(html).toContain('href="/clients?page=2&amp;size=50"');
		expect(html).not.toContain("Mai multe");
	});

	it("walks every page once, the last one partial, past the end showing the last", async () => {
		const seen: string[] = [];
		const pages = Math.ceil(total / 25);
		for (let p = 1; p <= pages; p++)
			seen.push(...rows(await page(olga, `/clients?page=${p}&size=25`)));
		expect(seen).toHaveLength(total);
		expect(new Set(seen).size).toBe(total);
		const last = await page(olga, `/clients?page=${pages}&size=25`);
		expect(rows(last)).toHaveLength(total - (pages - 1) * 25);
		expect(last).not.toContain('rel="next"');
		const past = await page(olga, "/clients?page=999&size=25");
		expect([current(past), rows(past)]).toEqual([String(pages), rows(last)]);
	});

	it("an exact multiple fills its last page; one match is one row and no page links; none says so", async () => {
		// "Pagină 000"…"Pagină 099": a hundred, four full pages of 25, the fourth the last.
		const fourth = await page(olga, "/clients?q=pagina&size=25&page=4");
		expect([rows(fourth).length, range(fourth), current(fourth)]).toEqual([
			25,
			"76–100 din 100",
			"4",
		]);
		expect(fourth).not.toContain('rel="next"');
		expect(current(await page(olga, "/clients?q=pagina&size=25&page=5"))).toBe("4");
		const ten = await page(olga, "/clients?q=pagina%2000&size=25");
		expect([rows(ten).length, range(ten)]).toEqual([10, "1–10 din 10"]);
		const one = await page(olga, "/clients?q=pagina%20007");
		expect([rows(one).length, range(one)]).toEqual([1, "1–1 din 1"]);
		expect(one).not.toContain('class="adm-pager__pages"');
		const none = await page(olga, "/clients?q=nimeni-nu-se-numeste-asa");
		expect(rows(none)).toEqual([]);
		expect(none).toContain("Niciun client nu se potrivește");
		expect(none).not.toContain("data-range");
	});

	it("a size change opens the page holding the first row shown", async () => {
		// Page 3 at 25 shows rows 51–75; at 50 that is page 2 (51–100), at 100 page 1.
		expect(current(await page(await k.as("rita"), "/clients?from=50&size=50&via=size"))).toBe("2");
		expect(current(await page(await k.as("rita"), "/clients?from=50&size=100&via=size"))).toBe("1");
		expect(current(await page(await k.as("rita"), "/clients?from=100&size=25&via=size"))).toBe("5");
	});
});

describe("the page size is the person's own", () => {
	it("is kept when they pick it, and a shared link's size is never kept", async () => {
		const ana = await k.as("nina");
		expect(rows(await page(ana, "/clients"))).toHaveLength(50);
		await page(ana, "/clients?page=1&size=100");
		expect(rows(await page(ana, "/clients"))).toHaveLength(50);
		await page(ana, "/clients?from=0&size=25&via=size");
		expect(rows(await page(ana, "/clients"))).toHaveLength(25);
		// The address still wins over the kept size.
		expect(rows(await page(ana, "/clients?size=100"))).toHaveLength(100);
		// Someone else's lists are not touched.
		expect(rows(await page(olga, "/clients"))).toHaveLength(50);
	});
});

describe("search, filters and order together", () => {
	it("narrows by therapist and search, orders descending, and counts the combination", async () => {
		const dora = k.api.world.ids.dora;
		const html = await page(olga, `/clients?q=pagina&practitioner=${dora}&sort=-name&size=25`);
		const expected = Math.ceil(EXTRA / 3);
		expect(range(html)).toBe(`1–25 din ${expected}`);
		const shown = names(html).map(fold);
		expect(shown).toEqual([...shown].sort().reverse());
		expect(shown.every((n) => n.startsWith("pagina"))).toBe(true);
	});

	it("filters by nobody treating and by package", async () => {
		const all = await k.api.world.store.c.clients.list("psizone", {
			eq: { status: "active" },
		});
		const unassigned = await page(olga, "/clients?flag=unassigned&size=100");
		expect(range(unassigned)).toContain(`din ${all.filter((c) => c.treating.length === 0).length}`);
		const holders = new Set(
			(await k.api.world.store.c.packages.list("psizone")).map((p) => p.clientId),
		);
		const withPkg = await page(olga, "/clients?package=with");
		expect(range(withPkg)).toBe(
			`1–${all.filter((c) => holders.has(c.id)).length} din ${all.filter((c) => holders.has(c.id)).length}`,
		);
	});

	it("a filter the person may not use (the blacklist, for a therapist) is not offered", async () => {
		const dora = await k.as("dora");
		const html = await page(dora, "/clients");
		expect(html).not.toContain('value="listed"');
		expect((await page(olga, "/clients")).includes('value="listed"')).toBe(true);
	});
});

describe("a therapist's list and count are their own clients'", () => {
	it("counts only who they treat, every row theirs", async () => {
		const dora = k.api.world.ids.dora;
		const own = (
			await k.api.world.store.c.clients.list("psizone", {
				eq: { status: "active" },
			})
		).filter((c) => c.treating.includes(dora));
		const html = await page(await k.as("dora"), "/clients?size=25");
		expect(range(html)).toBe(`1–25 din ${own.length}`);
		const ids = new Set(own.map((c) => c.id));
		expect(rows(html).every((id) => ids.has(id))).toBe(true);
	});
});

describe("the address", () => {
	it("round-trips: a parsed address builds back the same canonical one", () => {
		for (const href of [
			"/clients?page=1&size=50",
			"/clients?filter=archived&q=ana&sort=-last&practitioner=p1&flag=listed&package=with&page=3&size=25",
			"/clients?q=%C8%98tefan+%26+co&page=2&size=100",
		]) {
			const parsed = parseClients(Object.fromEntries(new URL(href, "http://x").searchParams));
			const ask = {
				filter: parsed.address.filter,
				q: parsed.address.q,
				sort: parsed.address.sort,
				practitioner: parsed.address.practitioner,
				flag: parsed.address.flag,
				pkg: parsed.address.package,
			};
			expect(clientsHref(ask, parsed.paging.page, parsed.paging.size ?? 0)).toBe(href);
		}
	});

	it("a value that is not the list's own falls back to the default instead of failing", async () => {
		const html = await page(olga, "/clients?sort=bogus&page=-3&size=7&flag=x&package=y&filter=z");
		expect([current(html), rows(html).length]).toEqual(["1", 50]);
	});

	it("a page link fetched in place patches the results and the filters, pushes the address and moves the focus", async () => {
		const res = await olga.raw("/clients?page=2&size=25", DATASTAR);
		expect(res.headers.get("content-type")).toContain("text/event-stream");
		const body = await res.text();
		expect(body).toContain('id="client-results"');
		expect(body).toContain('id="client-filters"');
		expect(body).not.toContain("selector #client-list");
		expect(rows(body)).toHaveLength(25);
		expect(body).toContain('history.pushState(null, "", "/clients?page=2&size=25")');
		expect(body).toContain('getElementById("client-results")?.focus');
	});

	it("the filters fetched in place patch only the results (the field typed in keeps its focus)", async () => {
		const body = await (
			await olga.raw("/clients?via=filters&q=pagina%2001&size=50", DATASTAR)
		).text();
		expect(body).toContain('id="client-results"');
		expect(body).not.toContain('id="client-filters"');
		expect(body).not.toContain(".focus(");
		expect(body).toContain('"/clients?q=pagina+01&page=1&size=50"');
	});

	it("the page follows Back and Forward in place", async () => {
		expect(await page(olga, "/clients")).toContain(
			'data-on:popstate__window="@get(location.pathname + location.search)"',
		);
	});
});
