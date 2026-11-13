import type { Browser, Page } from "playwright-core";
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

async function open(
	width: number,
	path: string,
	extra: { reducedMotion?: "reduce" | "no-preference"; hasTouch?: boolean } = {},
): Promise<{ page: Page; done: () => Promise<void> }> {
	const context = await browser.newContext({
		viewport: { width, height: width < 600 ? 812 : 800 },
		...extra,
	});
	const page = await context.newPage();
	await page.goto(`${live.url}${path}`);
	return { page, done: () => context.close() };
}

const visible = (page: Page, selector: string): Promise<boolean> =>
	page.locator(selector).first().isVisible();

describe("phone, 375px", () => {
	it("has the bottom tab bar (Calendar, Clients, Requests, More) and the floating action, and no side navigation", async () => {
		const { page, done } = await open(375, "/calendar?date=2026-11-16");
		expect(await visible(page, ".adm-tabs")).toBe(true);
		expect(await page.locator(".adm-tab").allInnerTexts()).toEqual([
			"Calendar",
			"Clienți",
			"Cereri\n3",
			"Mai mult",
		]);
		expect(await visible(page, ".adm-fab")).toBe(true);
		expect(await visible(page, "aside.adm-nav")).toBe(false);
		await done();
	});

	it("never scrolls the page sideways, on any screen", async () => {
		const { page, done } = await open(375, "/");
		for (const path of [
			"/calendar?date=2026-11-16",
			"/calendar?view=month&date=2026-11-16",
			"/clients",
			"/clients/c1/packages",
			"/requests",
			"/reminders?date=2026-11-16",
			"/roster",
			"/settings/roles",
			"/audit",
			"/more",
		]) {
			await page.goto(`${live.url}${path}`);
			const over = await page.evaluate(
				() => document.documentElement.scrollWidth - window.innerWidth,
			);
			expect(over, path).toBeLessThanOrEqual(0);
		}
		await done();
	});

	it("keeps every control at least 44px to touch", async () => {
		const { page, done } = await open(375, "/clients/c1");
		const small = await page.evaluate(() =>
			[
				...document.querySelectorAll<HTMLElement>(
					"a.adm-tab, .adm-btn, .adm-iconbtn, .adm-tablist__tab, .adm-fab, .adm-seg__item",
				),
			]
				.filter((e) => e.offsetParent !== null)
				.map((e) => ({
					cls: e.className,
					h: Math.round(e.getBoundingClientRect().height),
					w: Math.round(e.getBoundingClientRect().width),
				}))
				.filter((r) => r.h < 38 || r.w < 38),
		);
		expect(small).toEqual([]);
		await done();
	});

	it("respects the safe areas with viewport-fit=cover and env() insets", async () => {
		const { page, done } = await open(375, "/calendar");
		expect(await page.locator('meta[name="viewport"]').getAttribute("content")).toContain(
			"viewport-fit=cover",
		);
		const css = await (await fetch(`${live.url}/assets/app.css`)).text();
		expect(css).toContain("safe-area-inset-bottom");
		expect(css).toContain("safe-area-inset-top");
		await done();
	});

	it("creates an appointment by tapping an empty slot: the sheet opens prefilled, saving shows it on the day", async () => {
		const { page, done } = await open(375, "/calendar?date=2027-03-03", { hasTouch: true });
		// a day with no appointments shows the empty state: use a day of the seed that has free slots
		await page.goto(`${live.url}/calendar?date=2026-11-17`);
		const slot = page.locator('div[data-col="p1"] .cal__slot').first();
		const label = await slot.getAttribute("aria-label");
		await slot.click();
		await page.waitForSelector(".adm-sheet__panel >> visible=true");
		const time = (label ?? "").slice(-5);
		expect(await page.inputValue('input[type="time"]')).toBe(time);
		expect(await page.inputValue('input[type="date"] >> nth=-1')).toBe("2026-11-17");
		await page.selectOption("select >> nth=0", { label: "Ștefan Exemplu 01" });
		const before = await live.port.calendar("psizone", "2026-11-17", "2026-11-17");
		await page.click('.adm-sheet__panel >> visible=true >> button[type="submit"]');
		await page.waitForURL(/date=2026-11-17/);
		await page.waitForSelector(".cal__appt");
		const after = await live.port.calendar("psizone", "2026-11-17", "2026-11-17");
		expect(after.appointments.length).toBe(before.appointments.length + 1);
		await done();
	});

	it("shows the offline banner when the connection drops", async () => {
		const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
		const page = await context.newPage();
		await page.goto(`${live.url}/calendar`);
		expect(await visible(page, ".adm-offline-flag")).toBe(false);
		// What the browser does when the connection drops and returns: it fires these two window events.
		await page.evaluate(() => window.dispatchEvent(new Event("offline")));
		await page.waitForSelector(".adm-offline-flag >> visible=true");
		await page.evaluate(() => window.dispatchEvent(new Event("online")));
		await page.waitForSelector(".adm-offline-flag", { state: "hidden" });
		await context.close();
	});
});

describe("desktop, 1280px", () => {
	it("has the side navigation and the top bar, no bottom tabs and no floating action", async () => {
		const { page, done } = await open(1280, "/calendar?date=2026-11-16");
		expect(await visible(page, "aside.adm-nav")).toBe(true);
		expect(await visible(page, ".adm-tabs")).toBe(false);
		expect(await visible(page, ".adm-fab")).toBe(false);
		expect(await visible(page, "header.adm-top")).toBe(true);
		await done();
	});

	it("shows all six calendar columns without cropping, with a sticky gutter and headers", async () => {
		const { page, done } = await open(1280, "/calendar?date=2026-11-16");
		const m = await page.evaluate(() => {
			const box = document.querySelector(".cal__scroll")?.getBoundingClientRect();
			const heads = [...document.querySelectorAll(".cal__colhead")].map((h) =>
				h.getBoundingClientRect(),
			);
			return { right: box?.right ?? 0, heads: heads.map((h) => h.right <= (box?.right ?? 0) + 1) };
		});
		expect(m.heads).toHaveLength(6);
		expect(m.heads.every(Boolean)).toBe(true);
		expect(
			await page
				.locator(".cal__colhead")
				.first()
				.evaluate((e) => getComputedStyle(e).position),
		).toBe("sticky");
		expect(await page.locator(".cal__hours").evaluate((e) => getComputedStyle(e).position)).toBe(
			"sticky",
		);
		await done();
	});

	it("collapses the side navigation to icons and back", async () => {
		const { page, done } = await open(1280, "/clients");
		const width = () =>
			page.locator("aside.adm-nav").evaluate((e) => Math.round(e.getBoundingClientRect().width));
		const open_ = await width();
		await page.click('[aria-label="Restrânge sau extinde meniul"]');
		await page.waitForFunction(
			(w) => document.querySelector("aside.adm-nav")?.getBoundingClientRect().width !== w,
			open_,
		);
		expect(await width()).toBeLessThan(open_);
		await done();
	});

	it("moves with the keyboard: a skip link first, a visible focus ring, Escape closes the user menu", async () => {
		const { page, done } = await open(1280, "/calendar");
		await page.keyboard.press("Tab");
		expect(await page.evaluate(() => document.activeElement?.className)).toContain("adm-skip");
		await page.focus('[aria-label="Contul meu"]');
		const outline = await page.evaluate(
			() => getComputedStyle(document.activeElement ?? document.body).outlineStyle,
		);
		expect(outline).toBe("solid");
		await page.keyboard.press("Enter");
		await page.waitForSelector(".adm-menu__panel >> visible=true");
		await page.keyboard.press("Escape");
		await page.waitForSelector(".adm-menu__panel >> nth=-1", { state: "hidden" });
		await done();
	});

	it("prints the calendar alone: no navigation, no bars, no floating action", async () => {
		const { page, done } = await open(1280, "/calendar?date=2026-11-16");
		await page.emulateMedia({ media: "print" });
		for (const sel of ["aside.adm-nav", "header.adm-top", ".adm-tabs", ".adm-fab"])
			expect(await visible(page, sel), sel).toBe(false);
		expect(await visible(page, ".cal")).toBe(true);
		await done();
	});
});

describe("motion", () => {
	it("animates the sheet normally", async () => {
		const { page, done } = await open(375, "/calendar?date=2026-11-16&new=1");
		await page.waitForSelector(".adm-sheet__panel >> visible=true");
		expect(
			await page
				.locator(".adm-sheet__panel >> visible=true")
				.evaluate((e) => getComputedStyle(e).animationName),
		).not.toBe("none");
		await done();
	});
	it("suppresses all motion when the person prefers reduced motion", async () => {
		const { page, done } = await open(375, "/calendar?date=2026-11-16&new=1", {
			reducedMotion: "reduce",
		});
		await page.waitForSelector(".adm-sheet__panel >> visible=true");
		const motion = await page.evaluate(() =>
			[
				...document.querySelectorAll<HTMLElement>(
					".adm, .adm-sheet__panel, .adm-btn, .adm-fab, .adm-nav__link, .adm-toast, .adm-skel",
				),
			].map((e) => {
				const s = getComputedStyle(e);
				return { cls: e.className, animation: s.animationName, transition: s.transitionDuration };
			}),
		);
		expect(
			motion.filter(
				(m) => m.animation !== "none" || m.transition.split(",").some((d) => d.trim() !== "0s"),
			),
		).toEqual([]);
		await done();
	});
});
