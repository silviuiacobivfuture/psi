import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { type Mail, MailFailed } from "@psi/scheduling";
import { createBookingDeps, registerBookingSubmit } from "@psi/ui";
import { AXE_SOURCE, axeRunOn, launch, ViolationsSchema } from "@psi/ui/browser-testing";
import { Hono } from "hono";
import type { Browser, BrowserContext, Page } from "playwright-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { callbackMailCopy, site } from "./booking-site";

/**
 * Hemi-Sync's request form (the booking page with no calendar) in a real Chromium, styled by the
 * app's compiled app.css and driven by its Datastar bundle. The site serves one audience, so it asks
 * only when to call. The page is the app's own; only the request route's ports are test doubles.
 */

const PAGE = "/programare";
const FORM = "form#booking";
const THANKS = "Mulțumim, Ana Popescu.";
const FAILED = "Cererea nu a putut fi trimisă";

const gate: { mail: "ok" | "down" } = { mail: "ok" };
const sent: Mail[] = [];
const posts: string[] = [];

let browser: Browser;
let base: string;
let close: () => void;

beforeAll(async () => {
	const { app } = await import("./server");
	const deps = createBookingDeps({
		site,
		scheduling: undefined,
		mailer: {
			async send(mail) {
				if (gate.mail === "down") throw new MailFailed("EAUTH");
				sent.push(mail);
			},
		},
		notifyTo: ["team@example.test"],
		mailCopy: callbackMailCopy(),
		host: "hemisync.test",
		zone: "Europe/Bucharest",
		listUrl: undefined,
		log: () => undefined,
		failed: () => undefined,
	});
	const front = new Hono();
	registerBookingSubmit(front, deps, "ro");
	front.route("/", app);
	const server = serve({ fetch: front.fetch, port: 0, hostname: "127.0.0.1" });
	await new Promise<void>((resolve) => server.once("listening", () => resolve()));
	base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	close = () => server.close();
	browser = await launch();
}, 60_000);

afterAll(async () => {
	await browser?.close();
	close?.();
});

beforeEach(() => {
	gate.mail = "ok";
	sent.length = 0;
	posts.length = 0;
});

async function open(
	options: { width?: number; theme?: "light" | "dark" } = {},
): Promise<{ page: Page; context: BrowserContext }> {
	const width = options.width ?? 1280;
	const context = await browser.newContext({
		viewport: { width, height: 900 },
		reducedMotion: "reduce",
		hasTouch: width < 600,
		isMobile: width < 600,
	});
	await context.addCookies([
		{ name: "theme", value: `hemisync-${options.theme ?? "light"}`, url: base },
	]);
	const page = await context.newPage();
	page.on("request", (r) => {
		if (r.method() === "POST" && new URL(r.url()).pathname === PAGE) posts.push(r.postData() ?? "");
	});
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	await page.goto(`${base}${PAGE}`, { waitUntil: "networkidle" });
	expect(errors).toEqual([]);
	await page.locator(FORM).scrollIntoViewIfNeeded();
	return { page, context };
}

const box = (page: Page, name: string) => page.locator(FORM).getByRole("checkbox", { name });
const pill = (page: Page, name: string) =>
	page.locator(`${FORM} label.pz-choice`, { hasText: name });

async function filled(page: Page, name: string): Promise<boolean> {
	return pill(page, name).evaluate((el) => {
		const probe = document.createElement("span");
		probe.style.color = "var(--accent)";
		document.body.append(probe);
		const accent = getComputedStyle(probe).color;
		probe.remove();
		return getComputedStyle(el).backgroundColor === accent;
	});
}

async function fillContact(page: Page): Promise<void> {
	const form = page.locator(FORM);
	await form.getByLabel("Numele tău").fill("Ana Popescu");
	await form.getByLabel("Vârsta").fill("34");
	await form.getByLabel("Telefon").fill("0700 123 456");
	await form.getByLabel("E-mail").fill("ana@example.test");
	await form.getByLabel("Ce cauți?").fill("Mă interesează un workshop Gateway Voyage.");
	await form.getByLabel("Sunt de acord").check();
}

describe("the request form on Hemi-Sync", () => {
	it("asks no audience; the 'when' chips select visibly, Oricând stands alone, every chip is 44px", async () => {
		const { page, context } = await open({ width: 360 });
		expect(await page.locator(FORM).getByRole("radiogroup").count()).toBe(0);
		expect(await box(page, "Oricând").isChecked()).toBe(true);
		await pill(page, "Dimineața").click();
		await page.mouse.move(0, 0);
		expect(await box(page, "Dimineața").isChecked()).toBe(true);
		expect(await box(page, "Oricând").isChecked()).toBe(false);
		expect(await filled(page, "Dimineața")).toBe(true);
		expect(await filled(page, "Oricând")).toBe(false);
		await box(page, "Oricând").focus();
		await page.keyboard.press("Space");
		expect(await box(page, "Dimineața").isChecked()).toBe(false);
		for (const name of ["Dimineața", "După-amiaza", "Oricând"]) {
			const h = await pill(page, name).evaluate((el) => el.getBoundingClientRect().height);
			expect(h).toBeGreaterThanOrEqual(44);
		}
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			360,
		);
		await context.close();
	});

	it("validates the details on blur, not while typing", async () => {
		const { page, context } = await open();
		const field = page.locator(FORM).getByLabel("Ce cauți?");
		await field.click();
		await page.keyboard.type("Somn");
		expect(await page.locator("#b-details-error").isVisible()).toBe(false);
		expect(await page.locator("#b-details-min").textContent()).toBe("minim 10 caractere");
		expect(await page.locator(`${FORM} .pz-field__count`).textContent()).toBe("4 / 2000");
		await field.blur();
		expect(await page.locator("#b-details-error").isVisible()).toBe(true);
		await context.close();
	});

	it("posts the chosen times and thanks the person; a failure is said plainly", async () => {
		const { page, context } = await open();
		await fillContact(page);
		await pill(page, "După-amiaza").click();
		await page.locator(`${FORM} button[type=submit]`).click();
		await page.getByText(THANKS).waitFor();
		expect(posts).toHaveLength(1);
		expect(new URLSearchParams(posts[0]).getAll("when")).toEqual(["afternoon"]);
		expect(sent).toHaveLength(1);
		expect(sent[0]?.text).toContain("După-amiaza");
		await context.close();

		gate.mail = "down";
		const again = await open();
		await fillContact(again.page);
		await again.page.locator(`${FORM} button[type=submit]`).click();
		await again.page.getByText(FAILED).waitFor();
		expect(await again.page.getByText(THANKS).count()).toBe(0);
		await again.context.close();
	});
});

describe("axe, WCAG 2.2 AA, the form in both themes and both widths, untouched and with errors", () => {
	for (const theme of ["light", "dark"] as const) {
		for (const width of [360, 1280]) {
			it(`hemisync-${theme}, ${width}px`, async () => {
				const { page, context } = await open({ width, theme });
				expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(
					`hemisync-${theme}`,
				);
				await page.addScriptTag({ path: AXE_SOURCE });
				const run = axeRunOn(`document.querySelector(${JSON.stringify(FORM)})`);
				expect(ViolationsSchema.parse(await page.evaluate(run))).toEqual([]);
				await pill(page, "Dimineața").click();
				await page.locator(`${FORM} button[type=submit]`).click();
				await page.locator(`${FORM} [aria-invalid=true]`).first().waitFor();
				await page.addScriptTag({ path: AXE_SOURCE });
				expect(ViolationsSchema.parse(await page.evaluate(run))).toEqual([]);
				await context.close();
			});
		}
	}
});
