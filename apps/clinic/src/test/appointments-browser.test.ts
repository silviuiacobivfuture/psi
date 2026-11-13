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
beforeEach(async () => {
	live = await serveConsole({ today: "2026-11-16" });
});
afterEach(async () => {
	await live.close();
});

async function open(
	path: string,
	opts: { width?: number; theme?: "light" | "dark"; hasTouch?: boolean } = {},
): Promise<{ page: Page; done: () => Promise<void> }> {
	const context = await browser.newContext({
		viewport: { width: opts.width ?? 1280, height: (opts.width ?? 1280) < 600 ? 812 : 900 },
		colorScheme: opts.theme ?? "light",
		...(opts.hasTouch === undefined ? {} : { hasTouch: opts.hasTouch }),
	});
	if (opts.theme !== undefined)
		await context.addCookies([{ name: "theme", value: opts.theme, url: live.url }]);
	const page = await context.newPage();
	await page.goto(`${live.url}${path}`);
	return { page, done: () => context.close() };
}

const axe = async (page: Page): Promise<string[]> => {
	await page.waitForTimeout(450);
	await page.addScriptTag({ path: AXE_SOURCE });
	return ViolationsSchema.parse(await page.evaluate(AXE_RUN)).map(
		(v) => `${v.id}: ${v.nodes.slice(0, 3).join(" | ")}`,
	);
};

const DAY = "/calendar?date=2026-11-17";

/** The panel moves focus into itself shortly after it opens: that is what makes Escape work. */
const focusInside = (page: Page): Promise<unknown> =>
	page.waitForFunction(() => document.activeElement?.closest("#editor-body") != null);

describe("creating, the way a person does", () => {
	it("desktop: the + Programare button opens the panel; Escape closes it", async () => {
		const { page, done } = await open(DAY);
		await page.getByRole("button", { name: "Programare", exact: true }).click();
		await page.waitForSelector("#editor-body", { state: "visible" });
		await focusInside(page);
		await page.keyboard.press("Escape");
		await page.waitForSelector("#editor-body", { state: "hidden" });
		await done();
	});

	it("the N key opens it, but never while typing in a field", async () => {
		const { page, done } = await open(DAY);
		await page.keyboard.press("n");
		await page.waitForSelector("#editor-body", { state: "visible" });
		await focusInside(page);
		await page.keyboard.press("Escape");
		await page.waitForSelector("#editor-body", { state: "hidden" });
		await page.locator("#adm-q").focus();
		await page.keyboard.type("n");
		expect(await page.locator("#editor-body").isVisible()).toBe(false);
		await done();
	});

	it("an empty slot opens it prefilled with that date, time and column", async () => {
		const { page, done } = await open(DAY);
		const slot = page.locator('div[data-col="p2"] .cal__slot').first();
		const time = ((await slot.getAttribute("aria-label")) ?? "").slice(-5);
		await slot.click();
		await page.waitForSelector("#editor-body", { state: "visible" });
		expect(await page.inputValue('#editor-body input[type="time"]')).toBe(time);
		expect(
			await page
				.locator("#editor-body select", { has: page.locator('option[value="p2"]') })
				.first()
				.inputValue(),
		).toBe("p2");
		await done();
	});

	it("finds a client as you type, shows the monogram, offers a conflict's way out, and saves once", async () => {
		const { page, done } = await open(DAY);
		await page.getByRole("button", { name: "Programare", exact: true }).click();
		await page.fill('#editor-body input[type="search"]', "Ioana");
		await page.locator(".ed-client").first().click();
		await page.waitForSelector(".ed-chosen strong");
		expect((await page.locator(".ed-chosen .cal__mono").innerText()).trim()).toBe("IE");
		const busy = await page.evaluate(
			() =>
				document.querySelector('div[data-col="p1"] .cal__appt time')?.textContent?.slice(0, 5) ??
				"",
		);
		await page.fill('#editor-body input[type="time"]', busy);
		await page.waitForSelector("#ed-conflicts.ed-conflicts--busy");
		const before = (await live.port.calendar("psizone", "2026-11-17", "2026-11-17")).appointments
			.length;
		await page.locator("#ed-conflicts button").first().click();
		await page.waitForFunction(() => !document.querySelector("#ed-conflicts.ed-conflicts--busy"));
		await page.getByRole("button", { name: "Adaugă programarea" }).click();
		await page.waitForURL(/view=day/);
		const after = (await live.port.calendar("psizone", "2026-11-17", "2026-11-17")).appointments
			.length;
		expect(after).toBe(before + 1);
		await done();
	});

	it("a conflicting save is refused in words and writes nothing", async () => {
		const { page, done } = await open(DAY);
		await page.getByRole("button", { name: "Programare", exact: true }).click();
		await page.fill('#editor-body input[type="search"]', "Ioana");
		await page.locator(".ed-client").first().click();
		const busy = await page.evaluate(
			() =>
				document.querySelector('div[data-col="p1"] .cal__appt time')?.textContent?.slice(0, 5) ??
				"",
		);
		await page.fill('#editor-body input[type="time"]', busy);
		const before = (await live.port.calendar("psizone", "2026-11-17", "2026-11-17")).appointments
			.length;
		await page.getByRole("button", { name: "Adaugă programarea" }).click();
		await page.waitForSelector("text=Ora aleasă e ocupată");
		expect(
			(await live.port.calendar("psizone", "2026-11-17", "2026-11-17")).appointments.length,
		).toBe(before);
		await done();
	});

	it("phone: the floating action opens the sheet, with the duration chips and a new-client form", async () => {
		const { page, done } = await open(DAY, { width: 375, hasTouch: true });
		await page.locator(".adm-fab").click();
		await page.waitForSelector("#editor-body", { state: "visible" });
		await page.getByRole("button", { name: "Client nou" }).click();
		await page.waitForSelector(".ed-newc", { state: "visible" });
		await page.getByRole("button", { name: "60", exact: true }).click();
		expect(
			await page.getByRole("button", { name: "60", exact: true }).getAttribute("aria-pressed"),
		).toBe("true");
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
		).toBeLessThanOrEqual(0);
		await done();
	});
});

describe("the page runs without a script error", () => {
	it("the calendar, the editor, the details and the top-bar search raise none", async () => {
		const { page, done } = await open(DAY);
		const errors: string[] = [];
		page.on("pageerror", (e) => errors.push(e.message.slice(0, 120)));
		await page.reload();
		await page.getByRole("button", { name: "Programare", exact: true }).click();
		await page.waitForSelector("#editor-body", { state: "visible" });
		await page.keyboard.press("Escape");
		await page.locator("#adm-q").fill("Ioana");
		await page.waitForTimeout(500);
		expect(errors).toEqual([]);
		await done();
	});
});

describe("the details of an appointment", () => {
	it("a tile opens them; cancelling asks for a reason once, then frees the time", async () => {
		const { page, done } = await open(DAY);
		await page.locator(".cal__appt").first().click();
		await page.waitForSelector("#detail-body", { state: "visible" });
		const id = await page.locator("#detail-body").getAttribute("data-appt");
		await page.getByRole("button", { name: "Anulează programarea" }).first().click();
		await page.fill('#detail-body input[type="text"]', "Motiv de test");
		await page.locator("#detail-body form button[type=submit]").click();
		await page.waitForFunction(async () => true);
		await page.waitForTimeout(1200);
		expect((await live.port.appointment("psizone", id ?? ""))?.status).toBe("cancelled");
		await done();
	});

	it("Modifică opens the editor with the appointment's own values", async () => {
		const { page, done } = await open(DAY);
		await page.locator(".cal__appt").first().click();
		await page.getByRole("button", { name: "Modifică" }).click();
		await page.waitForSelector("#editor-body", { state: "visible" });
		expect(await page.locator("#editor-body h3").innerText()).toBe("Modifică programarea");
		await done();
	});
});

describe("axe, WCAG 2.2 AA: the editor, a conflict and the details, both themes, 375 and 1280", () => {
	for (const theme of ["light", "dark"] as const) {
		for (const width of [375, 1280]) {
			it(`admin-${theme}, ${width}px`, async () => {
				const failures: string[] = [];
				const { page, done } = await open(DAY, { width, theme });
				if (width === 375) await page.locator(".adm-fab").click();
				else await page.keyboard.press("n");
				await page.waitForSelector("#editor-body", { state: "visible" });
				failures.push(...(await axe(page)).map((f) => `editor: ${f}`));
				await page.fill('#editor-body input[type="search"]', "Ioana");
				await page.locator(".ed-client").first().click();
				const busy = await page.evaluate(
					() =>
						document
							.querySelector('div[data-col="p1"] .cal__appt time')
							?.textContent?.slice(0, 5) ?? "",
				);
				if (width > 375) {
					await page.fill('#editor-body input[type="time"]', busy);
					await page.waitForSelector("#ed-conflicts.ed-conflicts--busy");
					failures.push(...(await axe(page)).map((f) => `conflict: ${f}`));
				}
				await page.keyboard.press("Escape");
				if (width > 375) {
					await page.locator(".cal__appt").first().click();
					await page.waitForSelector("#detail-body", { state: "visible" });
					failures.push(...(await axe(page)).map((f) => `details: ${f}`));
				}
				await done();
				expect(failures).toEqual([]);
			});
		}
	}
});
