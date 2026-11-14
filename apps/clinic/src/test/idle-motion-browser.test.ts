import type { Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launch } from "./browser";
import { type LiveConsole, serveConsole } from "./harness";

/**
 * A console page is left open all day. Nothing on it may move forever: a turning gradient or a pulsing shadow repaints
 * (and re-blurs what is behind the assistant's bar) on every frame, which made every screen feel slow. The assistant's
 * ring, aura, orb and the top bar's glow play a few times on arrival, then rest; hovered, the ring turns again.
 */
let live: LiveConsole;
let browser: Browser;
beforeAll(async () => {
	live = await serveConsole({ today: "2026-11-16" }, { assistant: true });
	browser = await launch();
});
afterAll(async () => {
	await browser.close();
	await live.close();
});

const PAGES = ["/calendar?view=week&date=2026-11-16", "/clients", "/settings/audit"];

/** The page's running animations that never end, by name. */
const forever = (): string[] =>
	document
		.getAnimations()
		.filter(
			(a) =>
				a.playState === "running" && a.effect?.getTiming().iterations === Number.POSITIVE_INFINITY,
		)
		.map((a) => (a instanceof CSSAnimation ? a.animationName : a.constructor.name));

describe("nothing on a page at rest moves forever", () => {
	it.each(PAGES)("%s", async (path) => {
		const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
		const page = await context.newPage();
		await page.goto(`${live.url}${path}`);
		expect(await page.evaluate(forever)).toEqual([]);
		await context.close();
	});

	it("the ambient motion is finite and still plays on arrival", async () => {
		const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
		const page = await context.newPage();
		await page.goto(`${live.url}/clients`);
		const finite = await page.evaluate(() =>
			document
				.getAnimations()
				.filter((a) => a instanceof CSSAnimation)
				.map((a) => [(a as CSSAnimation).animationName, a.effect?.getTiming().iterations]),
		);
		const names = finite.map(([n]) => n);
		for (const name of ["pz-aura-spin", "pz-compass-breathe", "sa-glow"])
			expect(names).toContain(name);
		for (const [, n] of finite) expect(Number.isFinite(n)).toBe(true);
		await context.close();
	});

	it("hovering the assistant's bar turns its ring again", async () => {
		const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
		const page = await context.newPage();
		await page.goto(`${live.url}/clients`);
		const bar = page.locator(".pz-compass__bar").first();
		if ((await bar.count()) === 0) throw new Error("no assistant bar on the page");
		await bar.hover();
		expect(await page.evaluate(forever)).toContain("pz-aura-spin");
		await context.close();
	});
});
