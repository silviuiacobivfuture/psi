import { scaleUp } from "@psi/scheduling-api/testing-scale";
import type { Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AXE_RUN, AXE_SOURCE, launch, ViolationsSchema } from "./browser";
import { openAs, type ServedConsole, serveSdkConsole, sideways } from "./sdk-served";

/**
 * A client's appointments tab paged in a real Chromium at 360px, over the real service at the clinic's real size: the
 * next page replaces the rows in place and moves the address, Back follows it, nothing scrolls sideways, axe is clean.
 */
let served: ServedConsole;
let browser: Browser;
let client = "";
let total = 0;

beforeAll(async () => {
	served = await serveSdkConsole((world) => scaleUp(world, 1));
	const visits = await served.api.world.store.c.appointments.list("psizone");
	const by = new Map<string, number>();
	for (const v of visits)
		if (v.clientId !== undefined && v.deletedAt === undefined)
			by.set(v.clientId, (by.get(v.clientId) ?? 0) + 1);
	const most = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
	client = most?.[0] ?? "";
	total = most?.[1] ?? 0;
	browser = await launch();
}, 180_000);

afterAll(async () => {
	await browser.close();
	await served.close();
});

describe("a client's appointments at 360px", () => {
	it("pages in place, the address following, Back restoring, nothing sideways, axe clean", async () => {
		expect(total).toBeGreaterThan(25);
		const { page, errors, done } = await openAs(browser, served.url, "olga", 360);
		await page.goto(`${served.url}/clients/${client}/appointments?page=1&size=25`);
		const range = () => page.locator("#cl-pager-appointments [data-range]").innerText();
		const first = await range();
		expect(first.startsWith("1–25 din")).toBe(true);
		await page.locator('#cl-pager-appointments a[rel="next"]').click();
		await expect.poll(range, { timeout: 10_000 }).not.toBe(first);
		expect(new URL(page.url()).search).toBe("?page=2&size=25");
		await page.goBack();
		await expect.poll(range, { timeout: 10_000 }).toBe(first);
		expect(await sideways(page)).toBe(false);
		await page.addScriptTag({ path: AXE_SOURCE });
		expect(ViolationsSchema.parse(await page.evaluate(AXE_RUN))).toEqual([]);
		expect(errors).toEqual([]);
		await done();
	});
});
