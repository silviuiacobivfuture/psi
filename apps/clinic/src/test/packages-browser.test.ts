import type { Browser, Page } from "playwright-core";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AXE_RUN, AXE_SOURCE, launch, ViolationsSchema } from "./browser";
import { type LiveConsole, serveConsole } from "./harness";

let live: LiveConsole;
let browser: Browser;
beforeAll(async () => {
	browser = await launch();
});
afterAll(async () => {
	await browser.close();
});
// Every test starts from a fresh clinic: what one saves never shapes another.
beforeEach(async () => {
	live = await serveConsole({ today: "2026-11-16" });
});
afterEach(async () => {
	await live.close();
});

async function open(
	path: string,
	opts: { width?: number; theme?: "light" | "dark"; reducedMotion?: "reduce" } = {},
): Promise<{ page: Page; done: () => Promise<void> }> {
	const context = await browser.newContext({
		viewport: { width: opts.width ?? 1280, height: 900 },
		colorScheme: opts.theme ?? "light",
		...(opts.reducedMotion === undefined ? {} : { reducedMotion: opts.reducedMotion }),
	});
	if (opts.theme !== undefined)
		await context.addCookies([{ name: "theme", value: opts.theme, url: live.url }]);
	const page = await context.newPage();
	await page.goto(`${live.url}${path}`);
	return { page, done: () => context.close() };
}

const axe = async (page: Page): Promise<string[]> => {
	// Let any opening transition finish: contrast is judged on what is settled.
	await page.waitForTimeout(450);
	await page.addScriptTag({ path: AXE_SOURCE });
	return ViolationsSchema.parse(await page.evaluate(AXE_RUN)).map(
		(v) => `${v.id}: ${v.nodes.slice(0, 3).join(" | ")}`,
	);
};

describe("inline editing, with the keyboard", () => {
	it("Enter on a value opens it focused; Escape puts it back, focus returns, nothing is saved", async () => {
		const { page, done } = await open("/clients/c2/packages");
		const view = page.locator("#ie-k2_total-view");
		await view.focus();
		await page.keyboard.press("Enter");
		await page.waitForSelector("#ie-k2_total >> visible=true");
		expect(await page.evaluate(() => document.activeElement?.id)).toBe("ie-k2_total");
		await page.fill("#ie-k2_total", "999");
		await page.keyboard.press("Escape");
		await page.waitForSelector("#ie-k2_total", { state: "hidden" });
		await page.waitForFunction(() => document.activeElement?.id === "ie-k2_total-view");
		expect((await live.port.packages("psizone", "c2"))[0]?.totalBani).toBe(70000);
		await done();
	});

	it("Enter saves that one field once and shows the quiet check; the totals follow", async () => {
		const { page, done } = await open("/clients/c2/packages");
		await page.locator("#ie-k2_total-view").click();
		await page.fill("#ie-k2_total", "800,50");
		await page.keyboard.press("Enter");
		await page.waitForSelector("#pk-k2 .adm-inline__saved");
		expect((await live.port.packages("psizone", "c2"))[0]?.totalBani).toBe(80050);
		expect(await page.locator("#pk-k2 [data-testid=remaining]").innerText()).toContain("450,50");
		await done();
	});

	it("an unreadable value is refused in words and the field keeps what it had", async () => {
		const { page, done } = await open("/clients/c2/packages");
		await page.locator("#ie-k2_total-view").click();
		await page.fill("#ie-k2_total", "mult");
		await page.keyboard.press("Enter");
		await page.waitForSelector("text=Valoarea nu poate fi citită");
		expect((await live.port.packages("psizone", "c2"))[0]?.totalBani).toBe(70000);
		await done();
	});

	it("the quiet check does not animate when motion is reduced", async () => {
		const { page, done } = await open("/clients/c2/packages", { reducedMotion: "reduce" });
		await page.locator("#ie-k2_bonus-view").click();
		await page.fill("#ie-k2_bonus", "1");
		await page.keyboard.press("Enter");
		await page.waitForSelector("#pk-k2 .adm-inline__saved");
		const fn = await page.$eval(
			"#pk-k2 .adm-inline__saved",
			(e) => getComputedStyle(e).animationTimingFunction,
		);
		expect(fn).toMatch(/^steps\(1(, end)?\)$/);
		await done();
	});
});

describe("adding a payment", () => {
	it("is prefilled with the remaining amount, adds one row and updates the status", async () => {
		const { page, done } = await open("/clients/c2/packages");
		const amount = page.locator("#pk-k2 .pk__amount");
		expect(await amount.inputValue()).toBe("350,00");
		expect(await page.locator("#pk-k2 [data-testid=status]").innerText()).toContain(
			"Rest de plată",
		);
		await page.locator("#pk-k2 .pk__add").click();
		await page.waitForSelector("#pk-k2 [data-state=paid]");
		expect((await live.port.packages("psizone", "c2"))[0]?.payments).toHaveLength(2);
		await done();
	});
});

describe("the client's overflow menu", () => {
	it("opens focused on the first action; arrows move, Escape closes and returns focus", async () => {
		const { page, done } = await open("/clients/c1");
		const trigger = page.getByRole("button", { name: "Mai multe acțiuni" });
		await trigger.focus();
		await page.keyboard.press("Enter");
		await page.waitForSelector(".adm-overflow [role=menuitem] >> visible=true");
		await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "menuitem");
		const labels = await page.locator(".adm-overflow [role=menuitem]").allInnerTexts();
		const names = labels.map((l) => l.trim());
		// The menu is the registry's: what this person may do to a client, the destructive one last.
		for (const wanted of ["Editează datele", "Arhivează", "Adaugă în lista neagră", "Șterge"])
			expect(names).toContain(wanted);
		expect(names.at(-1)).toBe("Șterge");
		const active = () => page.evaluate(() => document.activeElement?.textContent?.trim());
		expect(await active()).toBe(names[0]);
		await page.keyboard.press("ArrowDown");
		expect(await active()).toBe(names[1]);
		await page.keyboard.press("End");
		expect(await active()).toBe("Șterge");
		await page.keyboard.press("ArrowDown");
		expect(await active()).toBe(names[0]);
		await page.keyboard.press("Escape");
		await page.waitForSelector(".adm-overflow [role=menuitem]", { state: "hidden" });
		expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))).toBe(
			"Mai multe acțiuni",
		);
		await done();
	});

	it("a click outside closes it; an action opens its one confirmation, nothing is written until then", async () => {
		const { page, done } = await open("/clients/c1");
		await page.getByRole("button", { name: "Mai multe acțiuni" }).click();
		await page.click("main h2");
		await page.waitForSelector(".adm-overflow [role=menuitem]", { state: "hidden" });
		await page.getByRole("button", { name: "Mai multe acțiuni" }).click();
		await page.click(".adm-menu__item--danger");
		await page.waitForSelector(".adm-sheet__panel >> visible=true");
		expect(await live.port.client("psizone", "c1")).not.toBeNull();
		await done();
	});
});

describe("axe, WCAG 2.2 AA, the new states in both admin themes at 375 and 1280", () => {
	for (const theme of ["light", "dark"] as const) {
		for (const width of [375, 1280]) {
			it(`admin-${theme}, ${width}px: editing a value, the menu open, the new-package sheet`, async () => {
				const failures: string[] = [];
				const { page, done } = await open("/clients/c2/packages", { width, theme });
				await page.locator("#ie-k2_total-view").click();
				await page.waitForSelector("#ie-k2_total >> visible=true");
				failures.push(...(await axe(page)).map((f) => `editing: ${f}`));
				await page.keyboard.press("Escape");
				await page.getByRole("button", { name: "Mai multe acțiuni" }).click();
				await page.waitForSelector(".adm-overflow [role=menuitem] >> visible=true");
				failures.push(...(await axe(page)).map((f) => `menu: ${f}`));
				await page.keyboard.press("Escape");
				// The same action is also in the client's menu (closed here): the button on the tab is the one pressed.
				await page.click('button.adm-btn--primary:has-text("Abonament nou")');
				await page.waitForSelector(".adm-sheet__panel >> visible=true");
				failures.push(...(await axe(page)).map((f) => `sheet: ${f}`));
				await done();
				expect(failures).toEqual([]);
			});
		}
	}
});
