import type { Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AXE_RUN, AXE_SOURCE, launch, ViolationsSchema } from "./browser";
import { openAs, type ServedConsole, serveSdkConsole, sideways } from "./sdk-served";

/**
 * The team, the requests, the blacklist and a day's reminders in a real Chromium on a phone (360px), over the real
 * service with a team of several pages: a page link replaces the rows in place and moves the address, the pager folds
 * to "page / pages", nothing scrolls sideways on any of the four lists, and axe finds nothing.
 */
let served: ServedConsole;
let browser: Browser;
const A = "/v1/apps/psizone";

beforeAll(async () => {
	served = await serveSdkConsole(async (world) => {
		for (let i = 0; i < 60; i++)
			await world.call("olga", "PUT", `${A}/members/paged-${String(i).padStart(3, "0")}`, {
				displayName: `Membru Pagină ${String(i).padStart(3, "0")}`,
				roles: [world.ids.roles.reception ?? "reception"],
				coordinates: [],
			});
	});
	browser = await launch();
}, 180_000);

afterAll(async () => {
	await browser.close();
	await served.close();
});

describe("at 360px", () => {
	it("the team: a page link replaces the rows in place, the address follows, the pager folds", async () => {
		const { page, errors, done } = await openAs(browser, served.url, "olga", 360);
		await page.goto(`${served.url}/settings/members?size=25`);
		const range = () => page.locator("#members-pager [data-range]").innerText();
		const total = Number(/din (\d+)/.exec(await range())?.[1] ?? "0");
		expect(total).toBeGreaterThan(50);
		expect(await page.locator("#members-pager .adm-pager__compact").innerText()).toBe(
			`1 / ${Math.ceil(total / 25)}`,
		);
		await page.locator('#members-pager a[rel="next"]').click();
		await expect.poll(range, { timeout: 10_000 }).toBe(`26–50 din ${total}`);
		expect(new URL(page.url()).search).toBe("?page=2&size=25");
		expect(await sideways(page)).toBe(false);
		expect(errors).toEqual([]);
		await done();
	});

	for (const path of [
		"/settings/members?page=2&size=25",
		"/requests",
		"/settings/blacklist",
		"/reminders?date=2026-11-16",
	])
		it(`${path}: nothing sideways, and axe finds nothing`, async () => {
			const { page, errors, done } = await openAs(browser, served.url, "olga", 360);
			await page.goto(`${served.url}${path}`);
			expect(await sideways(page)).toBe(false);
			await page.addScriptTag({ path: AXE_SOURCE });
			expect(ViolationsSchema.parse(await page.evaluate(AXE_RUN))).toEqual([]);
			expect(errors).toEqual([]);
			await done();
		});
});
