import type { Browser, BrowserContext, Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launch } from "./browser";
import { type LiveConsole, serveConsole } from "./harness";

/**
 * A link to a screen that only reads is fetched while the pointer rests on it, so the click opens an answer already
 * here (Chrome's speculation rules). A link whose opening the service writes down (a client's pages, a visit opened
 * by `appt=`: each a `clinical.read` audit event), the audit journal, a file download and `/switch/…` (a GET that
 * changes who the person is) are never fetched ahead.
 */
let live: LiveConsole;
let browser: Browser;
beforeAll(async () => {
	live = await serveConsole({ today: "2026-11-16" });
	browser = await launch();
});
afterAll(async () => {
	await browser.close();
	await live.close();
});

interface Watch {
	/** Every address Chrome has fetched ahead (path and query), with the last status it reported. */
	fetched: Map<string, { status: string; reason: string }>;
}

async function watch(context: BrowserContext, page: Page): Promise<Watch> {
	const cdp = await context.newCDPSession(page);
	const fetched: Watch["fetched"] = new Map();
	cdp.on("Preload.prefetchStatusUpdated", (e) => {
		const u = new URL(e.key.url);
		fetched.set(`${u.pathname}${u.search}`, { status: e.status, reason: e.prefetchStatus ?? "" });
	});
	await cdp.send("Preload.enable");
	return { fetched };
}

const settle = (page: Page): Promise<void> => page.waitForTimeout(900);

describe("a screen that only reads", () => {
	it("is fetched on hover and the click is answered by that fetch", async () => {
		const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
		const page = await context.newPage();
		const { fetched } = await watch(context, page);
		await page.goto(`${live.url}/calendar?view=week&date=2026-11-16`);
		await page.locator('.adm-nav__link[href="/clients"]').hover();
		await expect.poll(() => fetched.get("/clients")?.status, { timeout: 10_000 }).toBe("Ready");
		await Promise.all([
			page.waitForURL("**/clients"),
			page.locator('.adm-nav__link[href="/clients"]').click(),
		]);
		await expect
			.poll(() => fetched.get("/clients")?.reason, { timeout: 10_000 })
			.toBe("PrefetchResponseUsed");
		expect(await page.locator("#client-list").count()).toBe(1);
		await context.close();
	});

	it("is not fetched until the pointer rests on it", async () => {
		const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
		const page = await context.newPage();
		const { fetched } = await watch(context, page);
		await page.goto(`${live.url}/calendar?view=week&date=2026-11-16`);
		await settle(page);
		expect([...fetched.keys()]).toEqual([]);
		await context.close();
	});
});

describe("a link whose opening is written down or changes something", () => {
	it("a visit opened by appt= and a client's page are not fetched ahead", async () => {
		const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
		const page = await context.newPage();
		const { fetched } = await watch(context, page);
		await page.goto(`${live.url}/calendar?view=day&date=2026-11-16`);
		await page.locator("a.cal__appt").first().hover();
		await settle(page);
		await page.goto(`${live.url}/clients`);
		await page.locator('a[href^="/clients/"]').first().hover();
		await settle(page);
		expect(
			[...fetched.keys()].filter((k) => k.includes("appt=") || /^\/clients\/./.test(k)),
		).toEqual([]);
		await context.close();
	});

	it("the other app's switch link is not fetched ahead", async () => {
		const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
		const page = await context.newPage();
		const { fetched } = await watch(context, page);
		await page.goto(`${live.url}/calendar?view=week&date=2026-11-16`);
		await page.locator("[data-signals*='appMenu'] > button").first().click();
		await page.locator('a[href^="/switch/"]').first().hover();
		await settle(page);
		expect([...fetched.keys()].filter((k) => k.startsWith("/switch/"))).toEqual([]);
		await context.close();
	});
});
