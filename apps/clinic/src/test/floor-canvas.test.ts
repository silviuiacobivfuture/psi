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

interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

async function open(
	path: string,
	width: number,
	init?: string,
): Promise<{ page: Page; done: () => Promise<void> }> {
	const context = await browser.newContext({
		viewport: { width, height: width < 600 ? 812 : 900 },
		colorScheme: "light",
		hasTouch: width < 600,
	});
	const page = await context.newPage();
	if (init !== undefined) await page.addInitScript(init);
	await page.goto(`${live.url}${path}`);
	await page.waitForSelector("[data-fp-stage]");
	await page.waitForTimeout(300);
	return { page, done: () => context.close() };
}

const box = (page: Page, selector: string): Promise<Box | null> =>
	page.evaluate((sel) => {
		const el = document.querySelector(sel);
		if (el === null) return null;
		const r = el.getBoundingClientRect();
		return { x: r.x, y: r.y, w: r.width, h: r.height };
	}, selector);

const touches = (a: Box, b: Box): boolean =>
	a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const SCREENS = ["/floor", "/settings/plan"] as const;

describe("the floor plan is a full-viewport canvas", () => {
	for (const width of [375, 1280]) {
		for (const path of SCREENS) {
			it(`${path} at ${width}px: the plan fills the content under the top bar, with no page width, no title row and no sideways scroll`, async () => {
				const { page, done } = await open(path, width);
				const content = await box(page, ".adm-content");
				const stage = await box(page, "[data-fp-stage]");
				if (content === null || stage === null) throw new Error("no content or stage");
				expect(Math.abs(stage.x - content.x)).toBeLessThanOrEqual(1);
				expect(Math.abs(stage.w - content.w)).toBeLessThanOrEqual(1);
				expect(Math.abs(stage.y - content.y)).toBeLessThanOrEqual(1);
				expect(Math.abs(stage.h - content.h)).toBeLessThanOrEqual(1);
				const bar = await box(page, ".adm-top");
				if (bar === null) throw new Error("no top bar");
				expect(Math.abs(stage.y - (bar.y + bar.h))).toBeLessThanOrEqual(1);
				expect(await page.locator(".adm-content .adm-page").count()).toBe(0);
				expect(await page.locator(".adm-content .adm-pagehead, .adm-content h1").count()).toBe(0);
				expect(
					await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
				).toBe(true);
				await done();
			});
		}
	}

	it("the toolbars float over the plan: floor tabs, modes, time or tools, zoom in a corner, each inside the stage", async () => {
		const { page, done } = await open("/floor", 1280);
		const stage = await box(page, "[data-fp-stage]");
		if (stage === null) throw new Error("no stage");
		for (const sel of [
			".pz-fp__modes",
			".pz-fp__floorbar",
			".pz-fp__strip",
			".pz-fp__zoom",
			".pz-fp__btn--full",
			".pz-fp__btn--panel",
		]) {
			const b = await box(page, sel);
			if (b === null) throw new Error(`${sel} is missing`);
			expect(b.x).toBeGreaterThanOrEqual(stage.x);
			expect(b.y).toBeGreaterThanOrEqual(stage.y);
			expect(b.x + b.w).toBeLessThanOrEqual(stage.x + stage.w + 1);
			expect(b.y + b.h).toBeLessThanOrEqual(stage.y + stage.h + 1);
		}
		const zoom = await box(page, ".pz-fp__zoom");
		if (zoom === null) throw new Error("no zoom");
		expect(zoom.x + zoom.w).toBeGreaterThan(stage.x + stage.w - 24);
		expect(zoom.y).toBeLessThan(stage.y + 24);
		await done();
	});

	for (const width of [375, 1280]) {
		it(`at ${width}px nothing the person must reach sits under the assistant's bar, panel open or shut`, async () => {
			for (const path of SCREENS) {
				const { page, done } = await open(path, width);
				const capsule = await box(page, ".pz-compass__bar");
				if (capsule === null) throw new Error("the assistant's bar is not on the page");
				const controls = [
					".pz-fp__modes",
					".pz-fp__floorbar",
					".pz-fp__strip",
					".pz-fp__bar",
					".pz-fp__zoom",
					".pz-fp__btn--full",
					".pz-fp__btn--panel",
				];
				const check = async (): Promise<void> => {
					for (const sel of controls) {
						const b = await box(page, sel);
						if (b !== null && b.w > 0) expect(touches(b, capsule), `${path} ${sel}`).toBe(false);
					}
					const side = await box(page, ".pz-fp__side");
					if ((await page.locator(".pz-fp__side").isVisible()) && side !== null)
						expect(touches(side, capsule), `${path} the panel`).toBe(false);
				};
				await check();
				await page.click(".pz-fp__btn--panel");
				await page.waitForTimeout(150);
				expect(await page.getAttribute("[data-fp-root]", "data-panel")).toBe("open");
				await check();
				await done();
			}
		});
	}

	it("the rooms panel is shut on a phone and opens and closes from its button and its own close", async () => {
		const { page, done } = await open("/floor", 375);
		expect(await page.getAttribute("[data-fp-root]", "data-panel")).toBe("closed");
		expect(await page.locator(".pz-fp__side").isVisible()).toBe(false);
		await page.click(".pz-fp__btn--panel");
		expect(await page.locator(".pz-fp__side").isVisible()).toBe(true);
		expect(await page.getAttribute(".pz-fp__btn--panel", "aria-pressed")).toBe("true");
		const side = await box(page, ".pz-fp__side");
		const vp = page.viewportSize();
		if (side === null || vp === null) throw new Error("no panel");
		// A sheet along the foot of the screen on a phone, not a column on the right.
		expect(side.w).toBeGreaterThan(vp.width * 0.9);
		await page.click(".pz-fp__panel-head button");
		expect(await page.locator(".pz-fp__side").isVisible()).toBe(false);
		await done();
	});

	it("Ecran complet hides the navigation and the bars and fills the screen; the button and Esc bring them back", async () => {
		const { page, done } = await open("/floor", 1280);
		await page.click(".pz-fp__btn--full");
		await page.waitForTimeout(250);
		expect(
			await page.evaluate(() => document.querySelector(".adm")?.classList.contains("is-fp-full")),
		).toBe(true);
		expect(await page.locator(".adm-nav").isVisible()).toBe(false);
		expect(await page.locator(".adm-top").isVisible()).toBe(false);
		const stage = await box(page, "[data-fp-stage]");
		expect(stage).toMatchObject({ x: 0, y: 0, w: 1280, h: 900 });
		expect(await page.getAttribute(".pz-fp__btn--full", "aria-pressed")).toBe("true");
		await page.click(".pz-fp__btn--full");
		await page.waitForTimeout(250);
		expect(await page.locator(".adm-nav").isVisible()).toBe(true);
		expect(await page.locator(".adm-top").isVisible()).toBe(true);
		await done();
	});

	it("without the Fullscreen API the plan still fills the page, and Esc leaves it", async () => {
		const { page, done } = await open(
			"/floor",
			375,
			"Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false });",
		);
		await page.click(".pz-fp__btn--full");
		await page.waitForTimeout(200);
		expect(
			await page.evaluate(() => document.querySelector(".adm")?.classList.contains("is-fp-full")),
		).toBe(true);
		expect(await page.evaluate(() => document.fullscreenElement === null)).toBe(true);
		expect(await page.locator(".adm-top").isVisible()).toBe(false);
		expect(await page.locator(".adm-tabs").isVisible()).toBe(false);
		await page.keyboard.press("Escape");
		await page.waitForTimeout(150);
		expect(
			await page.evaluate(() => document.querySelector(".adm")?.classList.contains("is-fp-full")),
		).toBe(false);
		expect(await page.locator(".adm-top").isVisible()).toBe(true);
		await done();
	});

	it("two fingers zoom the plan on a phone (the pinch moves the view's scale)", async () => {
		const { page, done } = await open("/floor", 375);
		const scale = (): Promise<number> =>
			page.evaluate(() => {
				const t = document.querySelector("[data-fp-view]")?.getAttribute("transform") ?? "";
				return Number(/matrix\(([-\d.e]+)/.exec(t)?.[1] ?? "NaN");
			});
		const before = await scale();
		const stage = await box(page, "[data-fp-stage]");
		if (stage === null) throw new Error("no stage");
		const cx = stage.x + stage.w / 2;
		const cy = stage.y + stage.h / 2;
		const cdp = await page.context().newCDPSession(page);
		const touch = (
			type: "touchStart" | "touchMove" | "touchEnd",
			points: Array<{ x: number; y: number; id: number }>,
		): Promise<unknown> =>
			cdp.send("Input.dispatchTouchEvent", {
				type,
				touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id })),
			});
		await touch("touchStart", [
			{ x: cx - 30, y: cy, id: 1 },
			{ x: cx + 30, y: cy, id: 2 },
		]);
		for (const d of [50, 70, 90])
			await touch("touchMove", [
				{ x: cx - d, y: cy, id: 1 },
				{ x: cx + d, y: cy, id: 2 },
			]);
		await touch("touchEnd", []);
		expect(await scale()).toBeGreaterThan(before * 1.5);
		await done();
	});
});
