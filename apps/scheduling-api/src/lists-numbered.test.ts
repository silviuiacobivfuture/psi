import { beforeAll, describe, expect, it } from "vitest";
import { createWorld, type Populated } from "./testing/populate";

/**
 * The team, the blacklist and the web requests as numbered pages (`offset`, answered with `total` and `offset`): the
 * boundaries (the first page, an exact multiple, the last partial page, past the end answering the last, empty), the
 * cursor still draining the same rows, the blacklist's `clientsOnly` counting only the entries that name a client, and
 * each list refused to who may not see it.
 */
let w: Populated;
const base = "/v1/apps/psizone";
type Counted = {
	items: { id?: string; subject?: string }[];
	total: number;
	offset: number;
	nextCursor?: string;
};
const get = async (who: string, path: string): Promise<{ status: number; page: Counted }> => {
	const res = await w.call(who, "GET", `${base}${path}`);
	return { status: res.status, page: res.json as unknown as Counted };
};
const olga = async (path: string): Promise<Counted> => {
	const res = await get("olga", path);
	expect(res.status, JSON.stringify(res.page)).toBe(200);
	return res.page;
};
const window = `from=0&to=${Date.UTC(2100, 0, 1)}`;

beforeAll(async () => {
	w = await createWorld();
	for (let i = 0; i < 37; i++)
		await w.call("olga", "PUT", `${base}/members/paged-${String(i).padStart(3, "0")}`, {
			displayName: `Membru ${String(i).padStart(3, "0")}`,
			roles: [w.ids.roles.reception ?? "reception"],
			coordinates: [],
		});
	for (let i = 0; i < 23; i++) {
		const client = String(
			(await w.call("olga", "POST", `${base}/clients`, { name: `Listat ${i}` })).json.id,
		);
		await w.call("olga", "POST", `${base}/blacklist`, {
			client,
			reason: `motiv ${i}`,
			category: "other",
			severity: "warn",
		});
	}
	await w.call("olga", "POST", `${base}/blacklist`, {
		phone: "0733 777 777",
		reason: "doar telefon",
		category: "other",
		severity: "warn",
	});
	for (let i = 0; i < 13; i++)
		await w.callKey("psizone-web", "POST", `${base}/book/callback-requests`, {
			contact: { name: `Callback ${i}`, phone: `07330${String(i).padStart(5, "0")}` },
			locale: "ro",
		});
}, 120_000);

describe("the team", () => {
	it("counts every member and cuts pages at the offset asked, past the end the last", async () => {
		const all = (await w.store.c.members.list("psizone")).length;
		const first = await olga("/members?offset=0&limit=10");
		expect([first.items.length, first.total, first.offset]).toEqual([10, all, 0]);
		const last = Math.floor((all - 1) / 10) * 10;
		const tail = await olga(`/members?offset=${last}&limit=10`);
		expect([tail.items.length, tail.offset, tail.nextCursor]).toEqual([
			all - last,
			last,
			undefined,
		]);
		expect((await olga("/members?offset=99999&limit=10")).offset).toBe(last);
		expect((await olga("/members?offset=7&limit=10")).offset).toBe(0);
		const whole = await olga(`/members?offset=0&limit=${all}`);
		expect([whole.items.length, whole.nextCursor]).toEqual([all, undefined]);
	});

	it("the numbered pages and the cursor walk the same members in the same order", async () => {
		const byOffset: string[] = [];
		const total = (await olga("/members?offset=0&limit=10")).total;
		for (let o = 0; o < total; o += 10)
			byOffset.push(
				...(await olga(`/members?offset=${o}&limit=10`)).items.map((m) => m.subject ?? ""),
			);
		const byCursor: string[] = [];
		let cursor: string | undefined;
		do {
			const p = await olga(`/members?limit=10${cursor === undefined ? "" : `&cursor=${cursor}`}`);
			byCursor.push(...p.items.map((m) => m.subject ?? ""));
			cursor = p.nextCursor;
		} while (cursor !== undefined);
		expect(byOffset).toEqual(byCursor);
	});

	it("is refused to who may not see the team", async () => {
		const res = await get("vera", "/members?offset=0&limit=10");
		expect(res.status).toBe(403);
		expect(JSON.stringify(res.page)).not.toContain("Membru");
	});
});

describe("the blacklist", () => {
	it("counts the entries that name a client with clientsOnly, every entry without it", async () => {
		const clients = await olga("/blacklist?clientsOnly=true&offset=0&limit=10");
		const all = await olga("/blacklist?offset=0&limit=10");
		expect(clients.total).toBe(all.total - 1);
		expect(clients.total).toBeGreaterThanOrEqual(23);
		const last = Math.floor((clients.total - 1) / 10) * 10;
		const tail = await olga(`/blacklist?clientsOnly=true&offset=${last}&limit=10`);
		expect(tail.items).toHaveLength(clients.total - last);
	});

	it("is refused to who may not see it", async () => {
		expect((await get("vera", "/blacklist?offset=0&limit=10")).status).toBe(403);
	});
});

describe("the web requests", () => {
	it("counts the open ones in the window, newest first, and an empty state is total 0", async () => {
		const open = await olga(`/requests?${window}&state=open&offset=0&limit=5`);
		expect(open.total).toBeGreaterThanOrEqual(13);
		expect(open.items).toHaveLength(5);
		const none = await olga("/requests?from=0&to=1&offset=0&limit=5");
		expect([none.items, none.total, none.offset]).toEqual([[], 0, 0]);
	});

	it("is refused to who may not see them", async () => {
		expect((await get("vera", `/requests?${window}&offset=0&limit=5`)).status).toBe(403);
	});
});
