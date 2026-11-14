import { scaleUp } from "@psi/scheduling-api/testing-scale";
import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JOURNAL_PAGE } from "../audit/journal";
import { launch } from "./browser";
import { openAs, type ServedConsole, serveSdkConsole, sideways } from "./sdk-served";

/**
 * The console in a real Chromium, over the real scheduling service (its in-memory adapters, the synthetic clinic at its
 * real size: 220 clients, 5600 visits), on a phone (360px) and a desktop (1280px): the key screens render with what the
 * service answers, and nothing scrolls sideways or throws.
 */
let served: ServedConsole;
let url: string;
let browser: Browser;

beforeAll(async () => {
	served = await serveSdkConsole((world) => scaleUp(world, 1));
	url = served.url;
	browser = await launch();
}, 120_000);

afterAll(async () => {
	await browser.close();
	await served.close();
});

const as = (
	subject: string,
	width: number,
): Promise<{ page: Page; errors: string[]; done: () => Promise<void> }> =>
	openAs(browser, url, subject, width);

describe.each([360, 1280])("at %ipx", (width) => {
	it("the calendar week shows the service's visits and opens one", async () => {
		const { page, errors, done } = await as("olga", width);
		await page.goto(`${url}/calendar?view=week&date=2026-11-16`);
		expect(await page.locator(".cal__appt").count()).toBeGreaterThan(0);
		expect(await sideways(page)).toBe(false);
		expect(errors).toEqual([]);
		await done();
	});

	it("the journal shows one page, and 'Mai multe' appends the next", async () => {
		const { page, errors, done } = await as("olga", width);
		await page.goto(`${url}/settings/audit`);
		const rows = page.locator("#audit-rows tr");
		expect(await rows.count()).toBe(JOURNAL_PAGE);
		await page.locator("#audit-more button").click();
		await expect.poll(() => rows.count(), { timeout: 10_000 }).toBe(2 * JOURNAL_PAGE);
		expect(await sideways(page)).toBe(false);
		expect(errors).toEqual([]);
		await done();
	});

	it("a client's page, its notes and its packages render from the service", async () => {
		const { page, errors, done } = await as("olga", width);
		for (const path of [
			"/clients/cs000005",
			"/clients/cs000005/notes",
			"/clients/cs000004/packages",
		]) {
			const res = await page.goto(`${url}${path}`);
			expect(res?.status(), path).toBe(200);
			expect(await sideways(page), path).toBe(false);
		}
		expect(await page.content()).toContain("10 sessions");
		expect(errors).toEqual([]);
		await done();
	});

	it("the journal, the requests, the reminders and the roster render", async () => {
		const { page, errors, done } = await as("olga", width);
		for (const path of [
			"/settings/audit",
			"/requests",
			"/reminders?date=2026-11-16",
			"/roster",
			"/search?q=Scale%20Client%20001",
		]) {
			const res = await page.goto(`${url}${path}`);
			expect(res?.status(), path).toBe(200);
			expect(await sideways(page), path).toBe(false);
		}
		expect(errors).toEqual([]);
		await done();
	});
});
