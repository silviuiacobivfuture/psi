import type { Browser, Page } from "playwright-core";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { launch } from "./browser";
import { type LiveConsole, serveConsole } from "./harness";

/** Adding a member the way a person does, in a real browser: the search fills the form; the invitation's link copies. */
let live: LiveConsole;
let browser: Browser;
beforeAll(async () => {
	browser = await launch();
});
afterAll(async () => {
	await browser.close();
});
beforeEach(async () => {
	live = await serveConsole({
		today: "2026-11-16",
		staff: [
			{ subject: "acct-ana", displayName: "Ana Popescu", email: "ana.pop@example.test" },
			{
				subject: "acct-client",
				displayName: "Ana Clienta",
				email: "c@example.test",
				customer: true,
			},
		],
	});
});
afterEach(async () => {
	await live.close();
});

async function open(path: string): Promise<{ page: Page; done: () => Promise<void> }> {
	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: live.url });
	const page = await context.newPage();
	await page.goto(`${live.url}${path}`);
	return { page, done: () => context.close() };
}

describe("Adaugă membru in a browser", () => {
	it("typing finds the person; picking them fills the account, the name and the e-mail; saving adds them", async () => {
		const { page, done } = await open("/settings/members?new=1");
		const form = page.locator('form[data-form="member-new"]');
		await form.locator("[data-staff-search]").fill("ana");
		const pick = form.locator('button[data-staff="acct-ana"]');
		await pick.waitFor({ state: "visible" });
		expect(await form.locator('[data-staff="acct-client"]').count()).toBe(0);
		await pick.click();
		await expect.poll(() => form.locator('input[name="subject"]').inputValue()).toBe("acct-ana");
		expect(await form.locator('input[name="displayName"]').inputValue()).toBe("Ana Popescu");
		expect(await form.locator('input[name="email"]').inputValue()).toBe("ana.pop@example.test");
		await form.getByRole("button", { name: "Adaugă membru" }).click();
		await page.waitForURL(/edit=acct-ana/);
		expect((await live.port.members("psizone")).some((m) => m.subject === "acct-ana")).toBe(true);
		await done();
	});
});

describe("Invită prin e-mail in a browser", () => {
	it("the link is shown once, selects on focus and copies", async () => {
		const { page, done } = await open("/settings/members?invite=1");
		const form = page.locator('form[data-form="member-invite"]');
		await form.locator('input[name="email"]').fill("nou@example.test");
		await form.locator('input[name="displayName"]').fill("Nou Venit");
		await form.getByRole("button", { name: "Invită prin e-mail" }).click();
		const link = page.locator("#mb-invite-link");
		await link.waitFor({ state: "visible" });
		const value = await link.inputValue();
		expect(value).toMatch(/^https:\/\/sso\.example\.test\/recovery\//);
		await page.locator("[data-copy-link]").click();
		await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(value);
		await link.focus();
		await expect
			.poll(() =>
				page.evaluate(() => {
					const el = document.getElementById("mb-invite-link");
					return el instanceof HTMLInputElement
						? (el.selectionEnd ?? 0) - (el.selectionStart ?? 0)
						: 0;
				}),
			)
			.toBe(value.length);
		await done();
	});
});
