import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { LIST_PAGE } from "../port/port";
import { type SdkConsole, startSdkConsole } from "./sdk-harness";

/**
 * A client's files over the real service as numbered pages (files.list, counted by the service), every finished file
 * once; a file whose upload never finished is never shown nor counted.
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

describe("a client's files over the real service, as numbered pages", () => {
	it("every finished file once across the pages, newest first, none pending, the total the service's", async () => {
		const listed = (
			(await k.api.world.call("olga", "GET", `${A}/clients/${client}/files?limit=500`)).json
				.items as { id: string; status: string }[]
		)
			.filter((f) => f.status === "ready")
			.map((f) => f.id);
		const olga = await k.as("olga");
		const pages = Math.ceil(listed.length / 25);
		const all: string[] = [];
		for (let p = 1; p <= pages; p++) {
			const html = await (await olga.get(`/clients/${client}/files?page=${p}&size=25`)).text();
			expect(/data-range[^>]*>([^<]+)</.exec(html)?.[1]).toBe(
				`${(p - 1) * 25 + 1}–${Math.min(p * 25, listed.length)} din ${listed.length}`,
			);
			all.push(...[...html.matchAll(/data-file="([^"]+)"/g)].map((x) => x[1] ?? ""));
		}
		expect(all).toEqual(listed);
		for (const id of pending) expect(all).not.toContain(id);
	});

	it("a page fetched in place patches only the tab and is refused to who may not see files", async () => {
		const res = await (await k.as("olga")).raw(`/clients/${client}/files?page=2&size=25`, DATASTAR);
		expect(await res.text()).toContain('id="cl-tab-files"');
		const refused = await (await k.as("vera")).raw(
			`/clients/${client}/files?page=2&size=25`,
			DATASTAR,
		);
		expect(refused.status).toBe(403);
		expect(await refused.text()).not.toContain("data-file=");
	});
});
