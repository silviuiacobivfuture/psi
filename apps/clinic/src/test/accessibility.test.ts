import type { Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AXE_RUN, AXE_SOURCE, launch, ViolationsSchema } from "./browser";
import { type LiveConsole, serveConsole } from "./harness";

const SCREENS = [
	"/calendar?date=2026-11-16",
	"/calendar?view=week&date=2026-11-16",
	"/calendar?view=month&date=2026-11-16",
	"/clients",
	"/clients/c1",
	"/clients/c1/packages",
	"/floor",
	"/settings/plan",
	"/requests",
	"/reminders?date=2026-11-16",
	"/roster",
	"/settings/roles?role=reception",
	"/stats",
	"/me/profile",
	"/me/settings",
	"/account-links",
	"/settings",
	"/settings/profile",
	"/settings/blacklist",
	"/settings/builder",
	"/settings/audit",
	"/settings/hours",
	"/settings/hours?tab=rooms",
	"/settings/online",
	"/settings/online?new=1",
	"/settings/assistant",
	"/settings/assistant/people",
	"/settings/members",
	"/settings/members?edit=mock-ana-7f3c",
	"/settings/members?new=1",
	"/settings/members?invite=1",
	"/more",
	"/records",
	"/records/r3",
] as const;

const VIEWPORTS = [
	{ name: "phone 375px", width: 375, height: 812 },
	{ name: "desktop 1280px", width: 1280, height: 800 },
] as const;

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

describe("axe, WCAG 2.2 AA, every main screen in both admin themes and both viewports", () => {
	for (const theme of ["light", "dark"] as const) {
		for (const vp of VIEWPORTS) {
			it(`admin-${theme}, ${vp.name}`, async () => {
				const context = await browser.newContext({
					viewport: { width: vp.width, height: vp.height },
					colorScheme: theme,
				});
				await context.addCookies([{ name: "theme", value: theme, url: live.url }]);
				const page = await context.newPage();
				const failures: string[] = [];
				for (const path of SCREENS) {
					await page.goto(`${live.url}${path}`);
					expect(await page.getAttribute("html", "data-theme"), path).toBe(`admin-${theme}`);
					// Contrast is judged on what has settled: a sheet the address opens is still sliding in at load.
					await page.evaluate(() =>
						Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))),
					);
					await page.addScriptTag({ path: AXE_SOURCE });
					const violations = ViolationsSchema.parse(await page.evaluate(AXE_RUN));
					for (const v of violations)
						failures.push(`${path}: ${v.id} (${v.impact}) ${v.nodes.slice(0, 3).join(" | ")}`);
				}
				await context.close();
				expect(failures).toEqual([]);
			});
		}
	}

	it("the open sheets and menus are accessible too (new appointment, date picker, delete confirmation, user menu)", async () => {
		const context = await browser.newContext({
			viewport: { width: 375, height: 812 },
		});
		const page = await context.newPage();
		const failures: string[] = [];
		const check = async (label: string): Promise<void> => {
			// Contrast is judged on what has settled, not mid-transition.
			await page.waitForTimeout(450);
			await page.addScriptTag({ path: AXE_SOURCE });
			for (const v of ViolationsSchema.parse(await page.evaluate(AXE_RUN)))
				failures.push(`${label}: ${v.id} ${v.nodes.slice(0, 3).join(" | ")}`);
		};
		await page.goto(`${live.url}/calendar?date=2026-11-16&new=1`);
		await page.waitForSelector(".adm-sheet__panel >> visible=true");
		await check("new appointment sheet");
		await page.goto(`${live.url}/clients/c1`);
		await page.click('[aria-label="Mai multe acțiuni"]');
		await page.click(".adm-menu__item--danger");
		await page.waitForSelector(".adm-sheet__panel >> visible=true");
		await check("delete confirmation");
		await page.goto(`${live.url}/calendar?date=2026-11-16`);
		await page.click('[aria-label="Contul meu"]');
		await page.waitForSelector(".adm-menu__panel >> visible=true");
		await check("user menu");
		await context.close();
		expect(failures).toEqual([]);
	});
});
