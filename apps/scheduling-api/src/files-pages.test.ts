import { FileInitResult } from "@psi/scheduling-sdk/contract";
import { beforeAll, describe, expect, it } from "vitest";
import { createWorld, ok, type Populated } from "./testing/populate";

/**
 * A client's files as numbered pages (`files.list` with `offset`): the total and the page from the same read of that
 * client's files, newest first; `status=ready` leaves out (and does not count) an upload never finished; a page past the
 * end answers the last; the cursor still walks them for a caller that drains.
 */
const A = "/v1/apps/psizone";
type Counted = {
	items: { id: string; status: string }[];
	total: number;
	offset: number;
	nextCursor?: string;
};
let w: Populated;
let client = "";
const READY = 12;
const PENDING = 3;

const list = async (query: string): Promise<Counted> => {
	const res = await w.call("olga", "GET", `${A}/clients/${client}/files?${query}`);
	expect(res.status, JSON.stringify(res.json)).toBe(200);
	return res.json as unknown as Counted;
};

beforeAll(async () => {
	w = await createWorld();
	client = String(
		ok(await w.call("olga", "POST", `${A}/clients`, { name: "Cu Fișiere" }), "client").id,
	);
	for (let i = 0; i < READY + PENDING; i++) {
		const started = FileInitResult.parse(
			ok(
				await w.call("olga", "POST", `${A}/clients/${client}/files`, {
					name: `f-${i}.txt`,
					contentType: "text/plain",
					size: 3,
				}),
				"announce",
			),
		);
		if (i < PENDING) continue;
		await w.objects.upload(started.upload.url, started.file.size, started.file.contentType);
		ok(await w.call("olga", "POST", `${A}/files/${started.file.id}/complete`), "complete");
	}
});

describe("a client's files as numbered pages", () => {
	it("counts only the finished ones with `status=ready`, all of them without", async () => {
		expect((await list("status=ready&offset=0&limit=5")).total).toBe(READY);
		expect((await list("offset=0&limit=5")).total).toBe(READY + PENDING);
	});

	it("cuts pages: full, the last partial, past the end the last, every file once", async () => {
		const pages = await Promise.all(
			[0, 5, 10].map((o) => list(`status=ready&offset=${o}&limit=5`)),
		);
		expect(pages.map((p) => [p.items.length, p.offset])).toEqual([
			[5, 0],
			[5, 5],
			[2, 10],
		]);
		const ids = pages.flatMap((p) => p.items.map((f) => f.id));
		expect(new Set(ids).size).toBe(READY);
		expect(pages[2]?.nextCursor).toBeUndefined();
		expect((await list("status=ready&offset=500&limit=5")).offset).toBe(10);
		expect((await list("status=ready&offset=7&limit=5")).offset).toBe(5);
	});

	it("still walks by cursor for a caller that drains", async () => {
		const first = await list("status=ready&limit=5");
		expect(first.nextCursor).toBeDefined();
		const next = await list(`status=ready&limit=5&cursor=${first.nextCursor}`);
		expect(next.offset).toBe(5);
	});

	it("an empty client answers zero rows, total 0, offset 0", async () => {
		const empty = String(
			ok(await w.call("olga", "POST", `${A}/clients`, { name: "Fără" }), "client").id,
		);
		const res = await w.call("olga", "GET", `${A}/clients/${empty}/files?offset=25&limit=25`);
		expect(res.json).toEqual({ items: [], total: 0, offset: 0 });
	});
});
