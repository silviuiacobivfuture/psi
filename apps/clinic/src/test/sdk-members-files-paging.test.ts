import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { LIST_PAGE } from "../port/port";
import { type SdkConsole, type Session, startSdkConsole } from "./sdk-harness";

/**
 * A client's files over the real service, a page at a time (files.list with its cursor): one page and "Mai multe",
 * which appends the next page and goes with the last, every row once; a file whose upload never finished is never
 * shown, and a page short of rows still offers the next while the service has more. (The team is numbered pages:
 * sdk-lists-paging.test.ts.)
 */
const A = "/v1/apps/psizone";
const DATASTAR = { headers: { "datastar-request": "true" } };
const EXTRA = LIST_PAGE + 6;
const Started = z.object({
	file: z.object({ id: z.string(), size: z.number(), contentType: z.string() }),
	upload: z.object({ url: z.string() }),
});
let k: SdkConsole;
let client = "";
const pending: string[] = [];

beforeAll(async () => {
	k = await startSdkConsole();
	const w = k.api.world;
	client = String(
		(await w.call("olga", "POST", `${A}/clients`, { name: "Client Fișiere" })).json.id,
	);
	for (let i = 0; i < EXTRA; i++) {
		const started = Started.parse(
			(
				await w.call("olga", "POST", `${A}/clients/${client}/files`, {
					name: `fisier-${i}.txt`,
					contentType: "text/plain",
					size: 3,
				})
			).json,
		);
		// Every fifth upload is never finished: the service lists it as pending, the console never shows it.
		if (i % 5 === 4) {
			pending.push(started.file.id);
			continue;
		}
		await w.objects.upload(started.upload.url, started.file.size, started.file.contentType);
		const done = await w.call("olga", "POST", `${A}/files/${started.file.id}/complete`);
		expect(done.status, JSON.stringify(done.json)).toBe(200);
	}
});
afterAll(() => k.close());

const moreOf = (html: string, path: string): string | null => {
	const at = new RegExp(`(${path.replaceAll("/", "\\/")}\\?[^'"]*?)(?:'|&#39;)`).exec(html)?.[1];
	return at === undefined ? null : at.replaceAll("&amp;", "&");
};

async function walk(
	s: Session,
	page: string,
	more: string,
	rows: RegExp,
): Promise<{ first: number; all: string[]; answers: number; last: string }> {
	const html = await (await s.get(page)).text();
	const all = [...html.matchAll(rows)].map((x) => x[1] ?? "");
	const first = all.length;
	let next = moreOf(html, more);
	let answers = 0;
	let last = html;
	while (next !== null) {
		const res = await s.raw(next, DATASTAR);
		expect(res.headers.get("content-type")).toContain("text/event-stream");
		last = await res.text();
		expect(last).toContain("mode append");
		all.push(...[...last.matchAll(rows)].map((x) => x[1] ?? ""));
		next = moreOf(last, more);
		answers++;
	}
	return { first, all, answers, last };
}

describe("a client's files over the real service, a page at a time", () => {
	it("every finished file once, newest first, none pending; the control gone with the last", async () => {
		const listed = (
			(await k.api.world.call("olga", "GET", `${A}/clients/${client}/files?limit=500`)).json
				.items as { id: string; status: string }[]
		)
			.filter((f) => f.status === "ready")
			.map((f) => f.id);
		const { first, all, last } = await walk(
			await k.as("olga"),
			`/clients/${client}/files`,
			`/clients/${client}/more/files`,
			/data-file="([^"]+)"/g,
		);
		expect(first).toBeLessThan(LIST_PAGE);
		expect(first).toBeGreaterThan(0);
		expect(all).toEqual(listed);
		for (const id of pending) expect(all).not.toContain(id);
		expect(moreOf(last, `/clients/${client}/more/files`)).toBeNull();
	});

	it("is refused to who may not see files, answering nothing of them", async () => {
		const res = await (await k.as("vera")).raw(
			`/clients/${client}/more/files?cursor=50&shown=50`,
			DATASTAR,
		);
		expect(res.status).toBe(403);
		expect(await res.text()).not.toContain("data-file=");
	});
});
