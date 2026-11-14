import { CLIENT_PAGE_SIZES, CLIENT_SORTS, fold } from "@psi/scheduling/clinic";
import * as contract from "@psi/scheduling-sdk/contract";
import { beforeAll, describe, expect, it } from "vitest";
import { createWorld, type Populated } from "./testing/populate";
import { scaleUp } from "./testing/scale";

/**
 * The client list's numbered pages (`clients.list` with `offset`), against the clinic at its real size: the total from
 * the same read as the page, the boundaries (empty, one, an exact multiple, a last partial page, past the end), a size
 * change that keeps the position, the search with a filter and an order, and the reach: a therapist's rows AND count are
 * their own clients'. The blacklist filter is refused (and nothing answered) to someone who may not see the blacklist.
 */
let w: Populated;
const base = "/v1/apps/psizone";
type Item = {
	id: string;
	name: string;
	treating: string[];
	createdAt: number;
	lastVisitAt?: number;
};
type Counted = {
	items: Item[];
	total: number;
	offset: number;
	nextCursor?: string;
};
const as = async (who: string, query: string): Promise<{ status: number; page: Counted }> => {
	const res = await w.call(who, "GET", `${base}/clients?${query}`);
	return { status: res.status, page: res.json as unknown as Counted };
};
const olga = async (query: string): Promise<Counted> => {
	const res = await as("olga", query);
	expect(res.status, JSON.stringify(res.page)).toBe(200);
	return res.page;
};
let active = 0;

beforeAll(async () => {
	w = await createWorld();
	await scaleUp(w, 1);
	active = (await w.store.c.clients.list("psizone", { eq: { status: "active" } })).length;
}, 120_000);

describe("numbered pages of the client list", () => {
	it("counts every current client and cuts the first page", async () => {
		const page = await olga("offset=0&limit=50");
		expect(page.total).toBe(active);
		expect(page.items).toHaveLength(50);
		expect(page.offset).toBe(0);
		expect(page.nextCursor).toBeDefined();
	});

	it("walks every page once, the last one partial and without a cursor", async () => {
		const seen: string[] = [];
		for (let offset = 0; offset < active; offset += 50) {
			const page = await olga(`offset=${offset}&limit=50`);
			expect(page.offset).toBe(offset);
			seen.push(...page.items.map((c) => c.id));
			if (offset + 50 >= active) {
				expect(page.items).toHaveLength(active - offset);
				expect(page.nextCursor).toBeUndefined();
			}
		}
		expect(seen).toHaveLength(active);
		expect(new Set(seen).size).toBe(active);
	});

	it("an exact multiple is one full page; an offset at or past the end answers the last page", async () => {
		const whole = await olga(`offset=0&limit=${active}`);
		expect([whole.items.length, whole.nextCursor]).toEqual([active, undefined]);
		const atEnd = await olga(`offset=${active}&limit=25`);
		const last = Math.floor((active - 1) / 25) * 25;
		expect([atEnd.offset, atEnd.items.length]).toEqual([last, active - last]);
		expect((await olga("offset=999999&limit=25")).offset).toBe(last);
	});

	it("an empty answer is zero rows, total 0, offset 0; one match is one row", async () => {
		expect(await olga("offset=40&limit=25&q=nobody-is-called-this")).toEqual({
			items: [],
			total: 0,
			offset: 0,
		});
		const one = await olga("offset=0&limit=25&q=client%20one");
		expect([one.total, one.items.map((c) => c.name)]).toEqual([1, ["Client One"]]);
	});

	it("a size change keeps the position: the page holding the first row shown", async () => {
		expect((await olga("offset=100&limit=25")).offset).toBe(100);
		// Rows 125–149 shown at 25 a page; at 100 a page that is the page starting at 100.
		expect((await olga("offset=125&limit=100")).offset).toBe(100);
		expect((await olga("offset=125&limit=50")).offset).toBe(100);
	});

	it("orders by name (folded) by default and descending on `-name`", async () => {
		const names = (await olga("offset=0&limit=100")).items.map((c) => fold(c.name));
		expect(names).toEqual([...names].sort());
		const down = (await olga("offset=0&limit=100&sort=-name")).items.map((c) => fold(c.name));
		expect(down).toEqual([...down].sort().reverse());
	});

	it("orders by creation and by the latest visit, each row saying when it last came", async () => {
		const made = (await olga("offset=0&limit=100&sort=-created")).items.map((c) => c.createdAt);
		for (let i = 1; i < made.length; i++) expect(made[i]).toBeLessThanOrEqual(made[i - 1] ?? 0);
		const last = (await olga("offset=0&limit=100&sort=-last")).items;
		const came = last.flatMap((c) => (c.lastVisitAt === undefined ? [] : [c.lastVisitAt]));
		expect(came.length).toBeGreaterThan(0);
		for (let i = 1; i < came.length; i++) expect(came[i]).toBeLessThanOrEqual(came[i - 1] ?? 0);
		// Those who never came follow those who did.
		const firstNever = last.findIndex((c) => c.lastVisitAt === undefined);
		if (firstNever >= 0)
			expect(last.slice(firstNever).every((c) => c.lastVisitAt === undefined)).toBe(true);
	});

	it("combines the search, a practitioner filter and an order; the total counts the combination", async () => {
		const dora = w.ids.dora;
		const all = await w.store.c.clients.list("psizone", {
			eq: { status: "active" },
		});
		const expected = all.filter(
			(c) => c.treating.includes(dora) && fold(c.name).includes("client"),
		);
		const page = await olga(`offset=0&limit=10&q=client&practitioner=${dora}&sort=-name`);
		expect(page.total).toBe(expected.length);
		expect(page.items.every((c) => c.treating.includes(dora))).toBe(true);
		const folded = page.items.map((c) => fold(c.name));
		expect(folded).toEqual([...folded].sort().reverse());
	});

	it("filters by nobody treating and by package, and reads the archive apart", async () => {
		const all = await w.store.c.clients.list("psizone");
		const unassigned = await olga("offset=0&limit=100&flag=unassigned");
		expect(unassigned.total).toBe(
			all.filter((c) => c.status === "active" && c.treating.length === 0).length,
		);
		const holders = new Set((await w.store.c.packages.list("psizone")).map((p) => p.clientId));
		const withPkg = await olga("offset=0&limit=100&package=with");
		expect(withPkg.total).toBe(
			all.filter((c) => c.status === "active" && holders.has(c.id)).length,
		);
		const without = await olga("offset=0&limit=100&package=without");
		expect(withPkg.total + without.total).toBe(active);
		const archived = await olga("offset=0&limit=100&status=archived");
		expect(archived.total).toBe(all.filter((c) => c.status === "archived").length);
	});

	it("the blacklist filter answers the owner and is refused to a therapist", async () => {
		expect((await as("olga", "offset=0&limit=25&flag=listed")).status).toBe(200);
		const refused = await as("dora", "offset=0&limit=25&flag=listed");
		expect(refused.status).toBe(403);
		expect(JSON.stringify(refused.page)).not.toContain("Client");
	});
});

describe("a therapist's list is their own clients, and so is its count", () => {
	it("counts only the clients they treat, every row theirs, the pages walking them once", async () => {
		const dora = w.ids.dora;
		const own = (await w.store.c.clients.list("psizone", { eq: { status: "active" } })).filter(
			(c) => c.treating.includes(dora),
		);
		expect(own.length).toBeGreaterThan(0);
		expect(own.length).toBeLessThan(active);
		const seen: string[] = [];
		for (let offset = 0; offset < own.length; offset += 7) {
			const { status, page } = await as("dora", `offset=${offset}&limit=7`);
			expect(status).toBe(200);
			expect(page.total).toBe(own.length);
			for (const c of page.items) expect(c.treating).toContain(dora);
			seen.push(...page.items.map((c) => c.id));
		}
		expect(seen.sort()).toEqual(own.map((c) => c.id).sort());
	});

	it("another practitioner's filter answers them nothing, total 0", async () => {
		const { status, page } = await as("dora", `offset=0&limit=25&practitioner=${w.ids.elena}`);
		expect(status).toBe(200);
		const both = (await w.store.c.clients.list("psizone", { eq: { status: "active" } })).filter(
			(c) => c.treating.includes(w.ids.dora) && c.treating.includes(w.ids.elena),
		);
		expect(page.total).toBe(both.length);
	});

	it("someone with no client reach answers an empty page (or is refused), never the clinic's count", async () => {
		const { status, page } = await as("vera", "offset=0&limit=25");
		if (status === 200) expect([page.items, page.total]).toEqual([[], 0]);
		else expect(status).toBe(403);
	});
});

describe("the contract and the stores agree", () => {
	it("on the orders and the page sizes (the SDK derives none of them from the store)", () => {
		expect([...contract.CLIENT_SORTS]).toEqual([...CLIENT_SORTS]);
		expect([...contract.CLIENT_PAGE_SIZES]).toEqual([...CLIENT_PAGE_SIZES]);
		const base = { locale: "ro", theme: "system", calendarView: "day" } as const;
		for (const pageSize of CLIENT_PAGE_SIZES)
			expect(contract.MySettings.safeParse({ ...base, pageSize }).success).toBe(true);
		expect(contract.MySettings.safeParse({ ...base, pageSize: 10 }).success).toBe(false);
	});
});
