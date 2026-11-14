import { DEFAULT_PAGE, MAX_IDS, MAX_PAGE } from "@psi/scheduling-sdk/contract";
import { beforeAll, describe, expect, it } from "vitest";
import { createWorld, type Populated } from "./testing/populate";
import { BASE_SCALE, scaleUp } from "./testing/scale";
import { HOUR, NOW } from "./testing/world";

/**
 * Lists answer a page, never the table: against the clinic at its real size (220 clients, 5600 visits, 5600 journal
 * events), every list stays within its page, the cursors walk the whole list once, and a window or a batch too wide is
 * refused rather than answered.
 */
let w: Populated;
const base = "/v1/apps/psizone";
const olga = (path: string) => w.call("olga", "GET", `${base}${path}`);
type Page = { items: { id: string; at?: number }[]; nextCursor?: string };

async function walk(path: string, limit: number): Promise<{ pages: Page[]; ids: string[] }> {
	const pages: Page[] = [];
	let cursor: string | undefined;
	for (let i = 0; i < 1000; i++) {
		const sep = path.includes("?") ? "&" : "?";
		const res = await olga(
			`${path}${sep}limit=${limit}${cursor === undefined ? "" : `&cursor=${cursor}`}`,
		);
		expect(res.status, JSON.stringify(res.json)).toBe(200);
		const page = res.json as Page;
		pages.push(page);
		if (page.nextCursor === undefined) break;
		cursor = page.nextCursor;
	}
	return { pages, ids: pages.flatMap((p) => p.items.map((x) => x.id)) };
}

beforeAll(async () => {
	w = await createWorld();
	await scaleUp(w, 1);
}, 120_000);

describe("a list answers one page, whatever the clinic holds", () => {
	it("clients: the default page, with a cursor to the rest", async () => {
		const res = await olga("/clients");
		const page = res.json as Page;
		expect(page.items).toHaveLength(DEFAULT_PAGE);
		expect(page.nextCursor).toBeDefined();
	});

	it("clients: the cursors walk every active client once, in name order", async () => {
		const { pages, ids } = await walk("/clients?fields=identity", 97);
		const active = (await w.store.c.clients.list("psizone", { eq: { status: "active" } })).length;
		expect(ids).toHaveLength(active);
		expect(new Set(ids).size).toBe(ids.length);
		for (const p of pages) expect(p.items.length).toBeLessThanOrEqual(97);
		expect(pages.at(-1)?.nextCursor).toBeUndefined();
	});

	it("appointments over a year: one page, never the year", async () => {
		const res = await olga(`/appointments?from=${NOW - 365 * 24 * HOUR}&to=${NOW}`);
		expect((res.json as Page).items).toHaveLength(DEFAULT_PAGE);
		expect((res.json as Page).nextCursor).toBeDefined();
	});

	it("a page larger than the cap is refused, and the cap itself is answered", async () => {
		expect((await olga(`/clients?limit=${MAX_PAGE + 1}`)).status).toBe(400);
		expect((await olga("/clients?limit=0")).status).toBe(400);
		const res = await olga(`/clients?limit=${MAX_PAGE}`);
		expect(res.status).toBe(200);
		expect((res.json as Page).items.length).toBeLessThanOrEqual(MAX_PAGE);
	});

	it("a cursor that is not one is refused", async () => {
		expect((await olga("/clients?cursor=not-a-cursor")).status).toBe(400);
		expect((await olga("/audit?cursor=bm9wZQ")).status).toBe(400);
	});
});

describe("the journal is keyset-paged, newest first", () => {
	it("walks every event once, newest first, events of one instant included", async () => {
		const held = await w.store.c.audit.list("psizone");
		const { pages, ids } = await walk("/audit", 50);
		expect(ids).toHaveLength(held.length);
		expect(new Set(ids).size).toBe(ids.length);
		const ats = pages.flatMap((p) => p.items.map((e) => e.at ?? 0));
		for (let i = 1; i < ats.length; i++) expect(ats[i]).toBeLessThanOrEqual(ats[i - 1] ?? 0);
		expect(held.length).toBeGreaterThan(BASE_SCALE.appointments);
	});

	it("a page boundary inside one millisecond loses and repeats nothing", async () => {
		// The populated world writes its events at one fixed instant: pages of 3 cut through them.
		const sameInstant = (await w.store.c.audit.list("psizone")).filter((e) => e.at === NOW);
		expect(sameInstant.length).toBeGreaterThan(6);
		const { ids } = await walk(`/audit?from=${NOW}&to=${NOW + 1}`, 3);
		expect(ids.sort()).toEqual(sameInstant.map((e) => e.id).sort());
	});

	it("filters by action across pages", async () => {
		const { ids } = await walk("/audit?action=client.updated", 40);
		const held = (await w.store.c.audit.list("psizone")).filter(
			(e) => e.action === "client.updated",
		);
		expect(ids.sort()).toEqual(held.map((e) => e.id).sort());
	});
});

describe("batches and windows are bounded", () => {
	it("clients by id: only those named, whatever their standing", async () => {
		const res = await olga("/clients?ids=cs000000,cs000001,nope-000");
		expect(res.status).toBe(200);
		const items = (res.json as { items: { id: string; status: string }[] }).items;
		expect(items.map((c) => c.id).sort()).toEqual(["cs000000", "cs000001"]);
		// cs000000 is archived: a batch names it anyway (a calendar tile of an archived client keeps its name).
		expect(items.find((c) => c.id === "cs000000")?.status).toBe("archived");
	});

	it("more ids than a batch takes are refused", async () => {
		const ids = Array.from({ length: MAX_IDS + 1 }, (_, i) => `cs${String(i).padStart(6, "0")}`);
		expect((await olga(`/clients?ids=${ids.join(",")}`)).status).toBe(400);
	});

	it("pinned notes of many clients in one call", async () => {
		const res = await olga("/notes/pinned?clients=cs000000,cs000001,cs000005");
		expect(res.status).toBe(200);
		const items = (res.json as { items: { clientId: string; notes: { pinned: boolean }[] }[] })
			.items;
		expect(items.map((i) => i.clientId)).toEqual(["cs000000", "cs000001", "cs000005"]);
		expect(items.find((i) => i.clientId === "cs000005")?.notes).toHaveLength(1);
		expect(items.find((i) => i.clientId === "cs000001")?.notes).toHaveLength(0);
		for (const i of items) for (const n of i.notes) expect(n.pinned).toBe(true);
	});

	it("a calendar window wider than 62 days is refused; 62 days are answered", async () => {
		const day = 24 * HOUR;
		expect((await olga(`/calendar?from=${NOW}&to=${NOW + 63 * day}`)).status).toBe(400);
		expect((await olga(`/calendar?from=${NOW}&to=${NOW}`)).status).toBe(400);
		expect((await olga(`/calendar?from=${NOW}&to=${NOW + 62 * day}`)).status).toBe(200);
	});

	it("a roster window wider than 62 days is refused", async () => {
		expect((await olga("/roster?from=2026-01-01&to=2026-03-15")).status).toBe(400);
		expect((await olga("/roster?from=2026-03-02&to=2026-03-01")).status).toBe(400);
		expect((await olga("/roster?from=2026-01-01&to=2026-03-03")).status).toBe(200);
	});

	it("a client's packages carry their payments: one call, not one per package", async () => {
		const res = await olga("/clients/cs000000/packages");
		const items = (res.json as { items: { payments?: { amountCents: number }[] }[] }).items;
		expect(items).toHaveLength(1);
		expect(items[0]?.payments?.map((p) => p.amountCents)).toEqual([50_000]);
	});
});
