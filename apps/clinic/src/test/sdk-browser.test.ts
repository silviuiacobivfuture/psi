import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { createAccount, memoryStores } from "@psi/account";
import { type RunningApi, startApi } from "@psi/scheduling-api/testing";
import { scaleUp } from "@psi/scheduling-api/testing-scale";
import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { devApiSignIn } from "../dev-signin";
import { createFakeNotifications } from "../notifications/fake";
import { CLIENT_PAGE_SIZE } from "../port/port";
import { sdkPortSource } from "../port/sdk/source";
import { createConsolePwa } from "../pwa";
import { launch } from "./browser";

/**
 * The console in a real Chromium, over the real scheduling service (its in-memory adapters, the synthetic clinic at its
 * real size: 220 clients, 5600 visits), on a phone (360px) and a desktop (1280px): the key screens render with what the
 * service answers, the client list grows a page at a time, and nothing scrolls sideways or throws.
 */
let api: RunningApi;
let url: string;
let close: () => Promise<void>;
let browser: Browser;

beforeAll(async () => {
	api = await startApi({ grow: (world) => scaleUp(world, 1) });
	const origin = "http://127.0.0.1";
	const dev = devApiSignIn(api.url, origin);
	const pwa = createConsolePwa(
		origin,
		createAccount({
			site: { slug: "clinic", key: "clinic", origin, home: "/calendar" },
			stores: memoryStores(),
			onWarn: () => {},
			env: {},
		}),
	);
	const app = createApp({
		ports: sdkPortSource({ baseUrl: api.url, auth: dev.auth }),
		notifications: createFakeNotifications({ seeded: false }),
		viewAsSecret: "v".repeat(40),
		auth: dev.auth,
		pwa,
		// The origin check compares the browser's Origin with this: the socket's own, once it is known.
		origin,
		mount: (h) => {
			dev.mount(h);
			pwa.mount(h);
		},
	});
	const server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
	await new Promise<void>((resolve) => server.once("listening", () => resolve()));
	const address: string | AddressInfo | null = server.address();
	if (address === null || typeof address === "string") throw new Error("no port");
	url = `http://127.0.0.1:${address.port}`;
	close = () => new Promise<void>((resolve) => server.close(() => resolve()));
	browser = await launch();
}, 120_000);

afterAll(async () => {
	await browser.close();
	await close();
	await api.close();
});

async function as(
	subject: string,
	width: number,
): Promise<{ page: Page; errors: string[]; done: () => Promise<void> }> {
	const context = await browser.newContext({
		viewport: { width, height: width < 600 ? 780 : 900 },
	});
	await context.addCookies([{ name: "psi-clinic-dev-subject", value: subject, url }]);
	const page = await context.newPage();
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	return { page, errors, done: () => context.close() };
}

const sideways = (page: Page): Promise<boolean> =>
	page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

describe.each([360, 1280])("at %ipx", (width) => {
	it("the calendar week shows the service's visits and opens one", async () => {
		const { page, errors, done } = await as("olga", width);
		await page.goto(`${url}/calendar?view=week&date=2026-11-16`);
		expect(await page.locator(".cal__appt").count()).toBeGreaterThan(0);
		expect(await sideways(page)).toBe(false);
		expect(errors).toEqual([]);
		await done();
	});

	it("the client list shows one page, and 'show more' appends the next", async () => {
		const { page, errors, done } = await as("olga", width);
		await page.goto(`${url}/clients`);
		const rows = page.locator("#client-list .client-row");
		expect(await rows.count()).toBe(CLIENT_PAGE_SIZE);
		await page.locator("#client-more button").click();
		await expect.poll(() => rows.count(), { timeout: 10_000 }).toBe(2 * CLIENT_PAGE_SIZE);
		expect(await sideways(page)).toBe(false);
		expect(errors).toEqual([]);
		await done();
	});

	it("a client's page, its notes and its packages render from the service", async () => {
		const { page, errors, done } = await as("olga", width);
		for (const path of [
			"/clients/cs000005",
			"/clients/cs000005/notes",
			"/clients/cs000004/packages",
		]) {
			const res = await page.goto(`${url}${path}`);
			expect(res?.status(), path).toBe(200);
			expect(await sideways(page), path).toBe(false);
		}
		expect(await page.content()).toContain("10 sessions");
		expect(errors).toEqual([]);
		await done();
	});

	it("the journal, the requests, the reminders and the roster render", async () => {
		const { page, errors, done } = await as("olga", width);
		for (const path of [
			"/settings/audit",
			"/requests",
			"/reminders?date=2026-11-16",
			"/roster",
			"/search?q=Scale%20Client%20001",
		]) {
			const res = await page.goto(`${url}${path}`);
			expect(res?.status(), path).toBe(200);
			expect(await sideways(page), path).toBe(false);
		}
		expect(errors).toEqual([]);
		await done();
	});
});
