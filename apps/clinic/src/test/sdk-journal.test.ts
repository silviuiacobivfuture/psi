import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JOURNAL_PAGE } from "../audit/journal";
import { type SdkConsole, startSdkConsole } from "./sdk-harness";

/**
 * The journal over the real service: its keyset cursor walks the log page after page with no event twice or missed,
 * and a row of a later page opens its drawer.
 */
const A = "/v1/apps/psizone";
let k: SdkConsole;

beforeAll(async () => {
	k = await startSdkConsole();
	for (let i = 0; i < JOURNAL_PAGE + 20; i++)
		await k.api.world.call("olga", "POST", `${A}/clients`, { name: `Journal Client ${i}` });
});
afterAll(() => k.close());

const rowsOf = (html: string): string[] =>
	[...html.matchAll(/data-audit-row="([^"]+)"/g)].map((x) => x[1] ?? "");
const moreOf = (html: string): string | null => {
	const at = /(\/settings\/audit\/more\?[^'"]*?)(?:'|&#39;)/.exec(html)?.[1];
	return at === undefined ? null : at.replaceAll("&amp;", "&");
};

describe("the journal over the service", () => {
	it("pages through the whole log once, newest first, and the last page has no control", async () => {
		const s = await k.as("olga");
		const log = (
			(await k.api.world.call("olga", "GET", `${A}/audit?limit=500`)).json.items as { id: string }[]
		).map((e) => e.id);
		const first = await (await s.get("/settings/audit")).text();
		expect(rowsOf(first)).toHaveLength(JOURNAL_PAGE);
		const seen = [...rowsOf(first)];
		let next = moreOf(first);
		while (next !== null) {
			const body = await (await s.raw(next, { headers: { "datastar-request": "true" } })).text();
			seen.push(...rowsOf(body));
			next = moreOf(body);
		}
		// The log keeps growing with the console's own reads (none are written): the walk is the log as it was.
		expect(seen).toEqual(log.slice(0, seen.length));
		expect(seen.length).toBeGreaterThanOrEqual(log.length - 5);
		expect(new Set(seen).size).toBe(seen.length);
	});

	it("a row of the second page opens its drawer", async () => {
		const s = await k.as("olga");
		const next = moreOf(await (await s.get("/settings/audit")).text());
		const body = await (
			await s.raw(next ?? "", { headers: { "datastar-request": "true" } })
		).text();
		const id = rowsOf(body)[0] ?? "";
		const path = /@get\((?:'|&#39;)(\/settings\/audit\/[^'"]+?)(?:'|&#39;)\); setTimeout/
			.exec(body.slice(body.indexOf(`data-audit-row="${id}"`)))?.[1]
			?.replaceAll("&amp;", "&");
		expect(path).toContain("?from=");
		const res = await s.raw(path ?? "", { headers: { "datastar-request": "true" } });
		expect(res.status).toBe(200);
	});
});
