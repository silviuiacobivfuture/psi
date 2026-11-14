import type { Browser, BrowserContextOptions, Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AXE_RUN, AXE_SOURCE, launch, ViolationsSchema } from "./browser";
import { openAs, type ServedConsole, serveSdkConsole, sideways } from "./sdk-served";

/**
 * The role matrix in a real Chromium, over the real scheduling service, signed in as Reception: a phone gets the
 * role picker and a list that never scrolls sideways, a desktop the table with its sticky header and first column
 * and resources that open; axe finds nothing in either theme.
 */
let served: ServedConsole;
let url: string;
let browser: Browser;

beforeAll(async () => {
	served = await serveSdkConsole();
	url = served.url;
	browser = await launch();
}, 120_000);

afterAll(async () => {
	await browser.close();
	await served.close();
});

async function as(
	subject: string,
	width: number,
	extra: BrowserContextOptions = {},
	theme?: "light" | "dark",
): Promise<{ page: Page; errors: string[]; done: () => Promise<void> }> {
	const opened = await openAs(browser, url, subject, width, extra);
	if (theme !== undefined)
		await opened.page.context().addCookies([{ name: "theme", value: theme, url }]);
	return opened;
}

const reception = (): string => served.api.world.ids.roles.reception ?? "reception";
const therapist = (): string => served.api.world.ids.roles.therapist ?? "therapist";

describe("on a phone (360px)", () => {
	it("shows the role picker and the list, not the wide table, and nothing scrolls sideways", async () => {
		const { page, errors, done } = await as("rita", 360);
		for (const path of [
			"/roles/matrix",
			"/roles/matrix?detail=all",
			`/roles/matrix?a=${reception()}&b=${therapist()}&diff=1`,
		]) {
			expect((await page.goto(`${url}${path}`))?.status(), path).toBe(200);
			expect(await page.locator('[data-view="table"]').isVisible(), path).toBe(false);
			expect(await page.locator('[data-view="list"]').isVisible(), path).toBe(true);
			expect(await page.locator('select[name="role"]').isVisible(), path).toBe(true);
			// Every area open: the longest the list can be.
			await page.evaluate(() => {
				for (const d of document.querySelectorAll("details")) d.open = true;
			});
			expect(await sideways(page), path).toBe(false);
		}
		expect(errors).toEqual([]);
		await done();
	});

	it("picking another role shows that role's list", async () => {
		const { page, done } = await as("rita", 360);
		await page.goto(`${url}/roles/matrix`);
		await page.selectOption('select[name="role"]', therapist());
		await Promise.all([
			page.waitForURL(/role=/),
			page.click('[data-filters] button[type="submit"]'),
		]);
		expect(
			await page.locator(`[data-view="list"] [data-col="${therapist()}"]`).count(),
		).toBeGreaterThan(0);
		expect(await page.locator(`[data-view="list"] [data-col="${reception()}"]`).count()).toBe(0);
		await done();
	});
});

describe("on a desktop (1280px)", () => {
	it("the header and the first column stay in place; a resource opens to its actions", async () => {
		const { page, errors, done } = await as("rita", 1280);
		await page.goto(`${url}/roles/matrix`);
		expect(await page.locator('[data-view="list"]').isVisible()).toBe(false);
		const sticky = await page.evaluate(() => {
			const head = document.querySelector('[data-view="table"] thead th');
			const first = document.querySelector('[data-view="table"] tbody th[scope="row"]');
			return [head, first].map((el) => (el === null ? "" : getComputedStyle(el).position));
		});
		expect(sticky).toEqual(["sticky", "sticky"]);
		const action = page.locator('tr[data-row="clients.view"]');
		expect(await action.isVisible()).toBe(false);
		const toggle = page.locator('tr[data-resource="clients"] button.rm-toggle');
		await toggle.click();
		await expect.poll(() => action.isVisible()).toBe(true);
		expect(await toggle.getAttribute("aria-expanded")).toBe("true");
		await toggle.press("Enter");
		await expect.poll(() => action.isVisible()).toBe(false);
		expect(await toggle.getAttribute("aria-expanded")).toBe("false");
		expect(errors).toEqual([]);
		await done();
	});

	it("the toggle's turn is not animated when motion is reduced", async () => {
		const { page, done } = await as("rita", 1280, { reducedMotion: "reduce" });
		await page.goto(`${url}/roles/matrix`);
		const duration = await page.evaluate(() => {
			const icon = document.querySelector(".rm-toggle__icon");
			return icon === null ? "" : getComputedStyle(icon).transitionDuration;
		});
		expect(duration).toBe("0s");
		await done();
	});
});

describe("axe, WCAG 2.2 AA, in both admin themes and both viewports", () => {
	for (const theme of ["light", "dark"] as const)
		for (const width of [360, 1280])
			it(`admin-${theme}, ${width}px`, async () => {
				const { page, done } = await as("rita", width, { colorScheme: theme }, theme);
				const failures: string[] = [];
				for (const path of [
					"/roles/matrix",
					"/roles/matrix?detail=all",
					`/roles/matrix?a=${reception()}&b=${therapist()}&diff=1`,
				]) {
					await page.goto(`${url}${path}`);
					expect(await page.getAttribute("html", "data-theme"), path).toBe(`admin-${theme}`);
					await page.evaluate(() => {
						for (const d of document.querySelectorAll("details")) d.open = true;
					});
					await page.addScriptTag({ path: AXE_SOURCE });
					for (const v of ViolationsSchema.parse(await page.evaluate(AXE_RUN)))
						failures.push(`${path}: ${v.id} (${v.impact}) ${v.nodes.slice(0, 3).join(" | ")}`);
				}
				expect(failures).toEqual([]);
				await done();
			});
});
