import type { Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launch } from "./browser";
import { type LiveConsole, serveConsole } from "./harness";

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

/** Watches the shell's class from the very first moment of the document, and reports every change it saw. */
const WATCH = `(() => {
	window.__railChanges = [];
	const start = () => {
		const shell = document.querySelector('.adm');
		if (!shell) return false;
		window.__railChanges.push('first:' + shell.className);
		new MutationObserver((list) => { for (const m of list) if (m.attributeName === 'class') window.__railChanges.push(shell.className); }).observe(shell, { attributes: true });
		return true;
	};
	new MutationObserver((_l, o) => { if (start()) o.disconnect(); }).observe(document, { childList: true, subtree: true });
})();`;

async function load(path: string, cookie?: string, width = 1280) {
	const context = await browser.newContext({ viewport: { width, height: 800 } });
	if (cookie !== undefined)
		await context.addCookies([{ name: "adm-rail", value: cookie, url: live.url }]);
	await context.addInitScript(WATCH);
	const page = await context.newPage();
	await page.goto(`${live.url}${path}`);
	await page.waitForTimeout(800);
	return { page, context };
}

describe("the navigation rail is decided by the server and never changes after load", () => {
	for (const [path, cookie, collapsed] of [
		["/clients", undefined, false],
		["/clients", "1", true],
		["/calendar?date=2026-11-16", undefined, true],
		["/calendar?date=2026-11-16", "0", false],
		["/floor", "1", true],
		["/floor", "0", false],
	] as const) {
		it(`${path} with cookie ${cookie ?? "none"}: ${collapsed ? "collapsed" : "expanded"} on first paint, no class change after`, async () => {
			const { page, context } = await load(path, cookie);
			const changes = (await page.evaluate("window.__railChanges")) as string[];
			expect(changes).toHaveLength(1);
			expect(changes[0]?.includes("is-collapsed")).toBe(collapsed);
			expect(await page.locator(".adm").evaluate((e) => e.classList.contains("is-collapsed"))).toBe(
				collapsed,
			);
			await context.close();
		});
	}
	it("a click on the toggle saves the choice in the cookie, and the next page is served that way", async () => {
		const { page, context } = await load("/clients");
		await page.click(".adm-rail-toggle");
		await page.waitForFunction(() => document.cookie.includes("adm-rail=1"));
		await page.goto(`${live.url}/requests`);
		expect(await page.locator(".adm").evaluate((e) => e.classList.contains("is-collapsed"))).toBe(
			true,
		);
		await context.close();
	});
});

describe("tooltips of the navigation", () => {
	it("expanded: no native title on any link, so nothing repeats the visible label", async () => {
		const { page, context } = await load("/clients", "0");
		const titles = await page.locator("aside.adm-nav a[title]").count();
		expect(titles).toBe(0);
		await context.close();
	});
	it("collapsed: no native title either, and a styled tooltip shows on hover from the item's own name", async () => {
		const { page, context } = await load("/clients", "1");
		expect(await page.locator("aside.adm-nav a[title]").count()).toBe(0);
		const link = page.locator("aside.adm-nav a.adm-nav__link").first();
		const tip = await link.getAttribute("data-tip");
		expect(tip).not.toBeNull();
		await link.hover();
		const shown = await link.evaluate((e) => getComputedStyle(e, "::after").content);
		expect(shown).toContain(tip ?? "never");
		await context.close();
	});
	it("expanded: hovering shows no tooltip pseudo-element", async () => {
		const { page, context } = await load("/clients", "0");
		const link = page.locator("aside.adm-nav a.adm-nav__link").first();
		await link.hover();
		expect(await link.evaluate((e) => getComputedStyle(e, "::after").content)).toMatch(
			/none|normal/,
		);
		await context.close();
	});
});
