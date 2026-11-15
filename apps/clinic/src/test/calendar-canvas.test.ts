import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launch } from "./browser";
import { type LiveConsole, serveConsole } from "./harness";

let live: LiveConsole;
let browser: Browser;
beforeAll(async () => {
	browser = await launch();
	live = await serveConsole({ today: "2026-11-16" }, { assistant: true });
});
afterAll(async () => {
	await browser.close();
	await live.close();
});

const NO_FULLSCREEN_API =
	"Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false });";

async function open(
	path: string,
	width: number,
	options: { init?: string; cookie?: string } = {},
): Promise<{ page: Page; done: () => Promise<void> }> {
	const context = await browser.newContext({
		viewport: { width, height: width < 600 ? 812 : 900 },
		colorScheme: "light",
		hasTouch: width < 600,
	});
	if (options.cookie !== undefined)
		await context.addCookies([{ name: "adm-full", value: options.cookie, url: live.url }]);
	const page = await context.newPage();
	if (options.init !== undefined) await page.addInitScript(options.init);
	await page.goto(`${live.url}${path}`);
	await page.waitForSelector(".cal-page");
	return { page, done: () => context.close() };
}

/** Every element that scrolls vertically (content taller than its box) beyond the page itself. */
const verticalScrollers = (page: Page): Promise<string[]> =>
	page.evaluate(() =>
		[...document.querySelectorAll("*")]
			.filter((el) => {
				const s = getComputedStyle(el);
				return (
					(s.overflowY === "auto" || s.overflowY === "scroll") &&
					el.scrollHeight > el.clientHeight + 1
				);
			})
			.map((el) => String(el.className).split(" ")[0] ?? ""),
	);

const pageOverflow = (page: Page): Promise<{ x: number; y: number }> =>
	page.evaluate(() => ({
		x: document.documentElement.scrollWidth - innerWidth,
		y: document.documentElement.scrollHeight - innerHeight,
	}));

const DAY = "/calendar?view=day&date=2026-11-16";
const VIEWS: ReadonlyArray<readonly [string, string]> = [
	["day", DAY],
	["day, therapy rooms", `${DAY}&cat=therapy`],
	["day, neuro rooms", `${DAY}&cat=neuro`],
	["day, everything", `${DAY}&cat=all`],
	["week", "/calendar?view=week&date=2026-11-16"],
	["month", "/calendar?view=month&date=2026-11-16"],
];

describe("the calendar is one full-viewport scroll", () => {
	for (const width of [1440, 390]) {
		for (const [name, path] of VIEWS) {
			it(`${name} at ${width}px: the page does not scroll and the grid is the only vertical scroller`, async () => {
				const { page, done } = await open(path, width);
				const over = await pageOverflow(page);
				expect(over.y).toBeLessThanOrEqual(0);
				expect(over.x).toBeLessThanOrEqual(0);
				const scrollers = await verticalScrollers(page);
				expect(scrollers.length).toBeLessThanOrEqual(1);
				for (const s of scrollers) expect(["cal__scroll", "cal-page__body"]).toContain(s);
				await done();
			});
		}
	}

	it("fills the width under the top bar, edge to edge, on a desktop", async () => {
		const { page, done } = await open(DAY, 1440);
		const box = await page.locator(".cal").boundingBox();
		const nav = await page.locator("aside.adm-nav").boundingBox();
		expect(box?.x).toBe(nav?.width);
		expect((box?.x ?? 0) + (box?.width ?? 0)).toBe(1440);
		expect((box?.y ?? 0) + (box?.height ?? 0)).toBe(900);
		await done();
	});

	it("keeps the column headers and the time gutter in view while the grid scrolls both ways", async () => {
		const { page, done } = await open(`${DAY}&cat=all`, 390);
		const before = await page.locator(".cal__colhead").first().boundingBox();
		const gutterBefore = await page.locator(".cal__hours").boundingBox();
		await page.locator(".cal__scroll").evaluate((e) => {
			e.scrollTop = 200;
			e.scrollLeft = 150;
		});
		await page.waitForTimeout(100);
		expect((await page.locator(".cal__colhead").first().boundingBox())?.y).toBe(before?.y);
		expect((await page.locator(".cal__hours").boundingBox())?.x).toBe(gutterBefore?.x);
		expect(await page.locator(".cal__scroll").evaluate((e) => e.scrollLeft)).toBeGreaterThan(0);
		expect((await pageOverflow(page)).x).toBeLessThanOrEqual(0);
		await done();
	});

	it("the assistant's bar rests as its icon over the calendar and is the whole bar once it is used", async () => {
		const { page, done } = await open(DAY, 1440);
		const rest = await page.locator(".pz-compass__bar").boundingBox();
		expect(rest?.width).toBeLessThan(100);
		await page.click(".pz-compass__orb", { force: true });
		await page.waitForTimeout(300);
		const used = await page.locator(".pz-compass__bar").boundingBox();
		expect(used?.width).toBeGreaterThan(400);
		await done();
	});

	it("the last hour scrolls clear of the assistant's icon", async () => {
		const { page, done } = await open(DAY, 1440);
		const clear = await page.evaluate(() => {
			const s = document.querySelector(".cal__scroll");
			if (s === null) return false;
			s.scrollTop = s.scrollHeight;
			const grid = document.querySelector(".cal__grid");
			return grid !== null && parseFloat(getComputedStyle(grid).paddingBottom) >= 80;
		});
		expect(clear).toBe(true);
		await done();
	});
});

describe("Ecran complet", () => {
	const isFull = (page: Page): Promise<boolean> =>
		page.evaluate(() => document.querySelector(".adm")?.classList.contains("is-full") === true);

	it("hides the navigation and the bars, the grid takes the whole screen, and the button brings them back", async () => {
		const { page, done } = await open(DAY, 1440);
		expect(await page.getAttribute(".cal-full", "aria-pressed")).toBe("false");
		await page.click(".cal-full");
		await page.waitForTimeout(250);
		expect(await isFull(page)).toBe(true);
		expect(await page.locator("aside.adm-nav").isVisible()).toBe(false);
		expect(await page.locator("header.adm-top").isVisible()).toBe(false);
		const box = await page.locator(".cal__scroll").boundingBox();
		expect((box?.x ?? 1) + (box?.width ?? 0)).toBe(1440);
		expect(await page.getAttribute(".cal-full", "aria-pressed")).toBe("true");
		expect((await pageOverflow(page)).y).toBeLessThanOrEqual(0);
		await page.click(".cal-full");
		await page.waitForTimeout(250);
		expect(await isFull(page)).toBe(false);
		expect(await page.locator("aside.adm-nav").isVisible()).toBe(true);
		await done();
	});

	it("is remembered on this device: the next page is served already full", async () => {
		const { page, done } = await open(DAY, 1440, { init: NO_FULLSCREEN_API });
		await page.click(".cal-full");
		await page.waitForFunction(() => document.cookie.includes("adm-full=1"));
		await page.goto(`${live.url}/calendar?view=week&date=2026-11-16`);
		expect(await isFull(page)).toBe(true);
		expect(await page.locator("header.adm-top").isVisible()).toBe(false);
		await page.keyboard.press("Escape");
		await page.waitForFunction(() => document.cookie.includes("adm-full=0"));
		await page.goto(`${live.url}${DAY}`);
		expect(await isFull(page)).toBe(false);
		await done();
	});

	it("a saved choice is honoured on arrival, and Esc leaves it where the browser has no Fullscreen API", async () => {
		const { page, done } = await open(DAY, 390, { init: NO_FULLSCREEN_API, cookie: "1" });
		expect(await isFull(page)).toBe(true);
		expect(await page.locator(".adm-tabs").isVisible()).toBe(false);
		expect(await page.evaluate(() => document.fullscreenElement === null)).toBe(true);
		await page.keyboard.press("Escape");
		await page.waitForTimeout(150);
		expect(await isFull(page)).toBe(false);
		expect(await page.locator(".adm-tabs").isVisible()).toBe(true);
		await done();
	});

	it("other screens do not offer it", async () => {
		const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
		await context.addCookies([{ name: "adm-full", value: "1", url: live.url }]);
		const page = await context.newPage();
		await page.goto(`${live.url}/clients`);
		expect(await page.locator(".adm.is-full").count()).toBe(0);
		expect(await page.locator("aside.adm-nav").isVisible()).toBe(true);
		await context.close();
	});
});
