import { scaleUp } from "@psi/scheduling-api/testing-scale";
import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AXE_RUN, AXE_SOURCE, launch, ViolationsSchema } from "./browser";
import { openAs, type ServedConsole, serveSdkConsole, sideways } from "./sdk-served";

/**
 * The client list's pager in a real Chromium, over the real service at the clinic's real size (220 clients), on a phone
 * (360px) and a desktop (1280px): a page link replaces the rows in place and moves the address; Back and Forward follow
 * it; a refresh lands on the same page; the size picker keeps the first row in view and is remembered; the search
 * narrows as it is typed; the pager fits a 360px screen (the numbers folded to "2 / 5"); axe finds nothing.
 */
let served: ServedConsole;
let browser: Browser;
let total = 0;

beforeAll(async () => {
	served = await serveSdkConsole((world) => scaleUp(world, 1));
	total = (await served.api.world.store.c.clients.list("psizone", { eq: { status: "active" } }))
		.length;
	browser = await launch();
}, 180_000);

afterAll(async () => {
	await browser.close();
	await served.close();
});

const range = (page: Page): Promise<string> =>
	page.locator("#client-pager [data-range]").innerText();
const firstRow = (page: Page): Promise<string | null> =>
	page.locator("#client-list .client-row").first().getAttribute("data-client");
const path = (page: Page): string => {
	const u = new URL(page.url());
	return `${u.pathname}${u.search}`;
};

describe.each([360, 1280])("at %ipx", (width) => {
	it("a page link replaces the rows in place, the address follows, Back and refresh land on it", async () => {
		const { page, errors, done } = await openAs(browser, served.url, "olga", width);
		await page.goto(`${served.url}/clients`);
		expect(await range(page)).toBe(`1–50 din ${total}`);
		const first = await firstRow(page);
		// A marker the in-place update keeps (a full load would drop it).
		await page.evaluate(() => {
			Reflect.set(window, "__stayed", true);
		});
		await page.locator('#client-pager a[rel="next"]').click();
		await expect.poll(() => range(page), { timeout: 10_000 }).toBe(`51–100 din ${total}`);
		expect(path(page)).toBe("/clients?page=2&size=50");
		expect(await page.evaluate(() => Reflect.get(window, "__stayed"))).toBe(true);
		expect(await firstRow(page)).not.toBe(first);
		expect(await page.evaluate(() => document.activeElement?.id)).toBe("client-results");
		await page.goBack();
		await expect.poll(() => range(page), { timeout: 10_000 }).toBe(`1–50 din ${total}`);
		expect(await firstRow(page)).toBe(first);
		await page.goForward();
		await expect.poll(() => range(page), { timeout: 10_000 }).toBe(`51–100 din ${total}`);
		await page.reload();
		expect(await range(page)).toBe(`51–100 din ${total}`);
		expect(await sideways(page)).toBe(false);
		expect(errors).toEqual([]);
		await done();
	});

	it("the size picker keeps the first row shown in view, and the size is remembered", async () => {
		// A person of their own per width: the size one run keeps must not open the other.
		const who = width < 600 ? "rita" : "nina";
		const { page, errors, done } = await openAs(browser, served.url, who, width);
		await page.goto(`${served.url}/clients?page=3&size=25`);
		expect(await range(page)).toBe(`51–75 din ${total}`);
		await page.locator("#client-pager select").selectOption("50");
		await expect.poll(() => range(page), { timeout: 10_000 }).toBe(`51–100 din ${total}`);
		expect(path(page)).toBe("/clients?page=2&size=50");
		await page.goto(`${served.url}/clients`);
		expect(await range(page)).toBe(`1–50 din ${total}`);
		await page.locator("#client-pager select").selectOption("25");
		await expect.poll(() => range(page), { timeout: 10_000 }).toBe(`1–25 din ${total}`);
		await page.goto(`${served.url}/clients`);
		expect(await range(page)).toBe(`1–25 din ${total}`);
		expect(errors).toEqual([]);
		await done();
	});

	it("the search narrows as it is typed, the count and the address with it", async () => {
		const { page, errors, done } = await openAs(browser, served.url, "olga", width);
		await page.goto(`${served.url}/clients?page=3&size=50`);
		await page.locator("#clients-q").fill("Client One");
		await expect.poll(() => range(page), { timeout: 10_000 }).toBe("1–1 din 1");
		expect(path(page)).toBe("/clients?q=Client+One&page=1&size=50");
		// The field being typed in keeps the focus.
		expect(await page.evaluate(() => document.activeElement?.id)).toBe("clients-q");
		expect(errors).toEqual([]);
		await done();
	});
});

describe("at 360px the pager fits", () => {
	it("folds the numbers to 'page / pages' between the arrows, nothing sideways, touch-sized", async () => {
		const { page, done } = await openAs(browser, served.url, "olga", 360);
		await page.goto(`${served.url}/clients?page=2&size=50`);
		const compact = page.locator("#client-pager .adm-pager__compact");
		expect(await compact.isVisible()).toBe(true);
		expect(await compact.innerText()).toBe(`2 / ${Math.ceil(total / 50)}`);
		expect(await page.locator('#client-pager [aria-label="Pagina 3"]').isVisible()).toBe(false);
		const box = await page.locator('#client-pager a[rel="next"]').boundingBox();
		expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
		expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
		const pager = await page.locator("#client-pager").boundingBox();
		expect((pager?.x ?? 0) + (pager?.width ?? 0)).toBeLessThanOrEqual(360);
		expect(await sideways(page)).toBe(false);
		await done();
	});
});

describe("axe, WCAG 2.2 AA, the paged list in both themes", () => {
	for (const theme of ["light", "dark"] as const)
		for (const width of [360, 1280])
			it(`admin-${theme} at ${width}px, on a middle page with filters`, async () => {
				const { page, done } = await openAs(browser, served.url, "olga", width, {
					colorScheme: theme,
				});
				await page.context().addCookies([{ name: "theme", value: theme, url: served.url }]);
				await page.goto(`${served.url}/clients?page=2&size=25&sort=-last&package=without`);
				await page.addScriptTag({ path: AXE_SOURCE });
				const violations = ViolationsSchema.parse(await page.evaluate(AXE_RUN));
				expect(violations).toEqual([]);
				await done();
			});
});
