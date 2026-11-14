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
 * The contact page's request form in a real Chromium, styled by the app's compiled app.css and
 * driven by its Datastar bundle: what a visitor sees and can do. The page and every other route are
 * the app's own; only the request route's two ports are test doubles (no store, a mailer that can be
 * held or made to fail), so each case states what was posted and what reached the team.
 */

const PAGE = "/contact";
const FORM = "form#booking";
const THANKS = "Mulțumim, Ana Popescu.";
const FAILED = "Cererea nu a putut fi trimisă";

interface Gate {
	mail: "ok" | "down";
	hold: Promise<void> | undefined;
}
const gate: Gate = { mail: "ok", hold: undefined };
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
				if (gate.hold !== undefined) await gate.hold;
				if (gate.mail === "down") throw new MailFailed("EAUTH");
				sent.push(mail);
			},
		},
		notifyTo: ["team@example.test"],
		mailCopy: callbackMailCopy(),
		host: "landing.test",
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
	gate.hold = undefined;
	sent.length = 0;
	posts.length = 0;
});

async function open(
	options: { width?: number; theme?: "light" | "dark" } = {},
): Promise<{ page: Page; context: BrowserContext }> {
	const context = await browser.newContext({
		viewport: { width: options.width ?? 1280, height: 900 },
		reducedMotion: "reduce",
		hasTouch: (options.width ?? 1280) < 600,
		isMobile: (options.width ?? 1280) < 600,
	});
	await context.addCookies([
		{ name: "theme", value: `psizone-${options.theme ?? "light"}`, url: base },
	]);
	const page = await context.newPage();
	page.on("request", (r) => {
		if (r.method() === "POST" && new URL(r.url()).pathname === "/programare") {
			posts.push(r.postData() ?? "");
		}
	});
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	await page.goto(`${base}${PAGE}`, { waitUntil: "networkidle" });
	expect(errors).toEqual([]);
	await page.locator(FORM).scrollIntoViewIfNeeded();
	return { page, context };
}

const radio = (page: Page, name: string) => page.locator(FORM).getByRole("radio", { name });
const box = (page: Page, name: string) => page.locator(FORM).getByRole("checkbox", { name });
const pill = (page: Page, name: string) =>
	page.locator(`${FORM} label.pz-choice`, { hasText: name });

/** The pill's settled look: background, text colour, and whether its check mark shows. */
async function look(page: Page, name: string) {
	return pill(page, name).evaluate((el) => {
		const root = getComputedStyle(document.documentElement);
		const probe = document.createElement("span");
		document.body.append(probe);
		const color = (token: string) => {
			probe.style.color = `var(${token})`;
			return getComputedStyle(probe).color;
		};
		const accent = color("--accent");
		const onAccent = color("--on-accent");
		probe.remove();
		const svg = el.querySelector("svg");
		return {
			filled: getComputedStyle(el).backgroundColor === accent,
			inkOnAccent: getComputedStyle(el).color === onAccent,
			mark: svg === null ? "none" : getComputedStyle(svg).opacity,
			height: el.getBoundingClientRect().height,
			ring: getComputedStyle(el).outlineStyle,
			hasAccent: root.getPropertyValue("--accent") !== "",
		};
	});
}

async function fillContact(page: Page): Promise<void> {
	const form = page.locator(FORM);
	await form.getByLabel("Numele tău").fill("Ana Popescu");
	await form.getByLabel("Vârsta").fill("14");
	await form.getByLabel("Telefon").fill("0700 123 456");
	await form.getByLabel("E-mail").fill("ana@example.test");
	await form
		.getByLabel("Ce se întâmplă?")
		.fill("Fiica mea are atacuri de panică înainte de școală.");
}

describe("who the evaluation is for: a radio group", () => {
	it("each chip, clicked, is selected alone and drawn filled with the accent and a check mark", async () => {
		const { page, context } = await open();
		for (const name of ["Un copil", "Un adolescent", "Pentru mine"]) {
			await pill(page, name).click();
			await page.mouse.move(0, 0);
			expect(await radio(page, name).isChecked()).toBe(true);
			const on = await look(page, name);
			expect(on).toMatchObject({ filled: true, inkOnAccent: true, mark: "1", hasAccent: true });
			for (const other of ["Un copil", "Un adolescent", "Pentru mine"].filter((n) => n !== name)) {
				expect(await radio(page, other).isChecked()).toBe(false);
				expect(await look(page, other)).toMatchObject({ filled: false, mark: "0" });
			}
		}
		expect(await page.locator(FORM).getByRole("radiogroup").count()).toBe(1);
		await context.close();
	});

	it("arrow keys move and select, with a visible focus ring", async () => {
		const { page, context } = await open();
		await page.locator(FORM).getByLabel("Ce se întâmplă?").focus();
		await page.keyboard.press("Tab");
		expect(await radio(page, "Un copil").evaluate((el) => el === document.activeElement)).toBe(
			true,
		);
		expect((await look(page, "Un copil")).ring).toBe("solid");
		await page.keyboard.press("ArrowRight");
		expect(await radio(page, "Un adolescent").isChecked()).toBe(true);
		expect((await look(page, "Un adolescent")).ring).toBe("solid");
		expect((await look(page, "Un copil")).ring).toBe("none");
		await page.keyboard.press("ArrowRight");
		expect(await radio(page, "Pentru mine").isChecked()).toBe(true);
		expect(await radio(page, "Un adolescent").isChecked()).toBe(false);
		await context.close();
	});
});

describe("when we can call: a checkbox group where 'Oricând' stands alone", () => {
	it("starts on Oricând; a part of the day clears it, both parts may be ticked, Oricând clears them", async () => {
		const { page, context } = await open();
		const state = async () =>
			Promise.all(["Dimineața", "După-amiaza", "Oricând"].map((n) => box(page, n).isChecked()));
		expect(await state()).toEqual([false, false, true]);
		await pill(page, "Dimineața").click();
		expect(await state()).toEqual([true, false, false]);
		await pill(page, "După-amiaza").click();
		expect(await state()).toEqual([true, true, false]);
		await page.mouse.move(0, 0);
		expect(await look(page, "Dimineața")).toMatchObject({ filled: true, mark: "1" });
		expect(await look(page, "Oricând")).toMatchObject({ filled: false, mark: "0" });
		await pill(page, "Oricând").click();
		expect(await state()).toEqual([false, false, true]);
		await context.close();
	});

	it("space toggles the focused box", async () => {
		const { page, context } = await open();
		await box(page, "Dimineața").focus();
		await page.keyboard.press("Space");
		expect(await box(page, "Dimineața").isChecked()).toBe(true);
		expect(await box(page, "Oricând").isChecked()).toBe(false);
		expect((await look(page, "Dimineața")).ring).toBe("solid");
		await page.keyboard.press("Space");
		expect(await box(page, "Dimineața").isChecked()).toBe(false);
		await context.close();
	});
});

describe("touch targets and layout", () => {
	for (const width of [360, 1280]) {
		it(`every chip is at least 44px tall and nothing scrolls sideways at ${width}px`, async () => {
			const { page, context } = await open({ width });
			for (const name of [
				"Un copil",
				"Un adolescent",
				"Pentru mine",
				"Dimineața",
				"După-amiaza",
				"Oricând",
			]) {
				expect((await look(page, name)).height).toBeGreaterThanOrEqual(44);
			}
			const consent = await page
				.locator(`${FORM} label`, { hasText: "Sunt de acord" })
				.evaluate((el) => el.getBoundingClientRect().height);
			expect(consent).toBeGreaterThanOrEqual(44);
			expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
				width,
			);
			await context.close();
		});
	}
});

describe("the details field", () => {
	it("is a roomy multi-line input: padding, line height, minimum height", async () => {
		const { page, context } = await open();
		const box = await page.locator(`${FORM} textarea[name=details]`).evaluate((el) => {
			const s = getComputedStyle(el);
			return {
				top: Number.parseFloat(s.paddingTop),
				left: Number.parseFloat(s.paddingLeft),
				line: Number.parseFloat(s.lineHeight),
				height: el.getBoundingClientRect().height,
			};
		});
		expect(box.top).toBeGreaterThanOrEqual(10);
		expect(box.left).toBeGreaterThanOrEqual(14);
		expect(box.line).toBe(24);
		expect(box.height).toBeGreaterThanOrEqual(144);
		await context.close();
	});

	it("counts while typing, hints the minimum, and says nothing is wrong until the person leaves it", async () => {
		const { page, context } = await open();
		const field = page.locator(FORM).getByLabel("Ce se întâmplă?");
		const error = page.locator("#b-details-error");
		const min = page.locator("#b-details-min");
		const count = page.locator(`${FORM} .pz-field__count`);
		expect(await count.textContent()).toBe("0 / 2000");
		await field.click();
		for (const ch of "Somn") {
			await page.keyboard.type(ch);
			expect(await error.isVisible()).toBe(false);
			expect(await field.getAttribute("aria-invalid")).toBe("false");
		}
		expect(await count.textContent()).toBe("4 / 2000");
		expect(await min.textContent()).toBe("minim 10 caractere");
		expect(await min.isVisible()).toBe(true);

		await field.blur();
		expect(await error.isVisible()).toBe(true);
		expect(await field.getAttribute("aria-invalid")).toBe("true");
		expect(await field.getAttribute("aria-describedby")).toContain("b-details-error");
		expect(await min.isVisible()).toBe(false);
		const danger = await error.evaluate((el) => {
			const probe = document.createElement("span");
			probe.style.color = "var(--danger)";
			document.body.append(probe);
			const want = getComputedStyle(probe).color;
			probe.remove();
			return getComputedStyle(el).color === want;
		});
		expect(danger).toBe(true);

		// Typing again clears the error the moment the text is long enough, never adds one.
		await field.click();
		await page.keyboard.type("ul e agitat");
		expect(await error.isVisible()).toBe(false);
		expect(await field.getAttribute("aria-invalid")).toBe("false");
		expect(await min.isVisible()).toBe(false);
		expect(await count.textContent()).toBe("15 / 2000");
		await context.close();
	});

	it("an empty field left alone is not an error until the form is sent", async () => {
		const { page, context } = await open();
		const field = page.locator(FORM).getByLabel("Ce se întâmplă?");
		await field.focus();
		await field.blur();
		expect(await page.locator("#b-details-error").isVisible()).toBe(false);
		await context.close();
	});

	it("stops at 2000 characters, counted as the server counts them", async () => {
		const { page, context } = await open();
		const field = page.locator(FORM).getByLabel("Ce se întâmplă?");
		await field.fill(`${"a\n".repeat(999)}abc`);
		expect(await field.evaluate((el) => (el as HTMLTextAreaElement).value.length)).toBe(2000);
		await field.dispatchEvent("input");
		expect(await page.locator(`${FORM} .pz-field__count`).textContent()).toBe("2000 / 2000");
		await context.close();
	});
});

describe("sending the request", () => {
	it("posts the chosen chips, thanks the person, and the team reads them", async () => {
		const { page, context } = await open();
		await fillContact(page);
		await pill(page, "Un adolescent").click();
		await pill(page, "După-amiaza").click();
		await page.locator(FORM).getByLabel("Sunt de acord").check();
		await page.locator(`${FORM} button[type=submit]`).click();
		await page.getByText(THANKS).waitFor();
		expect(posts).toHaveLength(1);
		const body = new URLSearchParams(posts[0]);
		expect(body.get("forWhom")).toBe("teen");
		expect(body.getAll("when")).toEqual(["afternoon"]);
		expect(body.get("consent")).toBe("yes");
		expect(sent).toHaveLength(1);
		expect(sent[0]?.text).toContain("Un adolescent");
		expect(sent[0]?.text).toContain("După-amiaza");
		await context.close();
	});

	it("both parts of the day travel as two values and reach the team as 'Oricând'", async () => {
		const { page, context } = await open();
		await fillContact(page);
		await pill(page, "Pentru mine").click();
		await pill(page, "Dimineața").click();
		await pill(page, "După-amiaza").click();
		await page.locator(FORM).getByLabel("Sunt de acord").check();
		await page.locator(`${FORM} button[type=submit]`).click();
		await page.getByText(THANKS).waitFor();
		expect(new URLSearchParams(posts[0]).getAll("when")).toEqual(["morning", "afternoon"]);
		expect(sent[0]?.text).toContain("Oricând");
		await context.close();
	});

	it("is disabled and busy while sending, and a second click or Enter sends nothing more", async () => {
		const { page, context } = await open();
		let release = (): void => undefined;
		gate.hold = new Promise<void>((resolve) => {
			release = resolve;
		});
		await fillContact(page);
		await pill(page, "Un copil").click();
		await page.locator(FORM).getByLabel("Sunt de acord").check();
		const button = page.locator(`${FORM} button[type=submit]`);
		await button.click();
		await expect.poll(() => button.isDisabled()).toBe(true);
		expect(await page.locator(FORM).getAttribute("aria-busy")).toBe("true");
		await button.click({ force: true });
		await page.locator(FORM).getByLabel("Numele tău").press("Enter");
		release();
		await page.getByText(THANKS).waitFor();
		expect(posts).toHaveLength(1);
		expect(sent).toHaveLength(1);
		await context.close();
	});

	it("says plainly when the request reached nobody", async () => {
		gate.mail = "down";
		const { page, context } = await open();
		await fillContact(page);
		await pill(page, "Un copil").click();
		await page.locator(FORM).getByLabel("Sunt de acord").check();
		await page.locator(`${FORM} button[type=submit]`).click();
		await page.getByText(FAILED).waitFor();
		expect(await page.getByRole("alert").count()).toBeGreaterThan(0);
		expect(await page.getByText(THANKS).count()).toBe(0);
		await context.close();
	});

	for (const failure of ["a 500", "a dropped connection"] as const) {
		it(`${failure}: sent once, never retried, and the form says it did not go through`, async () => {
			const { page, context } = await open();
			await page.route("**/programare", (route) =>
				route.request().method() !== "POST"
					? route.continue()
					: failure === "a 500"
						? route.fulfill({ status: 500, body: "" })
						: route.abort("connectionreset"),
			);
			await fillContact(page);
			await pill(page, "Un copil").click();
			await page.locator(FORM).getByLabel("Sunt de acord").check();
			const button = page.locator(`${FORM} button[type=submit]`);
			const alert = page.locator(`${FORM} p[role=alert]`);
			expect(await alert.isVisible()).toBe(false);
			await button.click();
			await alert.waitFor({ state: "visible" });
			expect(await alert.textContent()).toContain(FAILED);
			await page.waitForTimeout(3000);
			expect(posts).toHaveLength(1);
			expect(sent).toHaveLength(0);
			expect(await button.isDisabled()).toBe(false);
			// A second try that goes through clears the message and thanks the person.
			await page.unroute("**/programare");
			await button.click();
			await page.getByText(THANKS).waitFor();
			expect(posts).toHaveLength(2);
			await context.close();
		}, 15_000);
	}

	it("an incomplete form comes back with each error under its field and the first one focused", async () => {
		const { page, context } = await open();
		await page.locator(`${FORM} button[type=submit]`).click();
		await page.locator(`${FORM} [aria-invalid=true]`).first().waitFor();
		expect(sent).toHaveLength(0);
		expect(await page.locator("#b-details-error").isVisible()).toBe(true);
		expect(await page.locator("#b-for-error").textContent()).toBe(
			"Eroare: alege pentru cine e evaluarea.",
		);
		expect(await page.locator(FORM).getByRole("radiogroup").getAttribute("aria-invalid")).toBe(
			"true",
		);
		expect(await page.locator("#b-consent-error").isVisible()).toBe(true);
		expect(await page.evaluate(() => document.activeElement?.getAttribute("name"))).toBe("name");
		await context.close();
	});
});

describe("axe, WCAG 2.2 AA, the form in both themes and both widths, untouched and with errors", () => {
	for (const theme of ["light", "dark"] as const) {
		for (const width of [360, 1280]) {
			it(`psizone-${theme}, ${width}px`, async () => {
				const { page, context } = await open({ width, theme });
				expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(
					`psizone-${theme}`,
				);
				await page.addScriptTag({ path: AXE_SOURCE });
				const run = axeRunOn(`document.querySelector(${JSON.stringify(FORM)})`);
				expect(ViolationsSchema.parse(await page.evaluate(run))).toEqual([]);
				await pill(page, "Un adolescent").click();
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
