import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { createAccount, memoryStores } from "@psi/account";
import { type RunningApi, startApi } from "@psi/scheduling-api/testing";
import type { Populated } from "@psi/scheduling-api/testing-populate";
import type { Browser, BrowserContextOptions, Page } from "playwright-core";
import { createApp } from "../app";
import { devApiSignIn } from "../dev-signin";
import { createFakeNotifications } from "../notifications/fake";
import { sdkPortSource } from "../port/sdk/source";
import { createConsolePwa } from "../pwa";

/** The console on a real socket over the real scheduling service, for a real browser to open. */
export interface ServedConsole {
	api: RunningApi;
	/** `http://127.0.0.1:<port>`. */
	url: string;
	close(): Promise<void>;
}

/**
 * The console served for a real Chromium, over the real scheduling service (its in-memory adapters, the populated
 * synthetic clinic, grown by `grow`), signed in through the development flow (a cookie names the person).
 */
export async function serveSdkConsole(
	grow?: (world: Populated) => Promise<unknown>,
): Promise<ServedConsole> {
	const api = await startApi(grow === undefined ? {} : { grow });
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
	return {
		api,
		url: `http://127.0.0.1:${address.port}`,
		async close() {
			await new Promise<void>((resolve) => server.close(() => resolve()));
			await api.close();
		},
	};
}

/** A browser context signed in as `subject` at `width`, collecting the page's uncaught errors. */
export async function openAs(
	browser: Browser,
	url: string,
	subject: string,
	width: number,
	extra: BrowserContextOptions = {},
): Promise<{ page: Page; errors: string[]; done: () => Promise<void> }> {
	const context = await browser.newContext({
		viewport: { width, height: width < 600 ? 780 : 900 },
		...extra,
	});
	await context.addCookies([{ name: "psi-clinic-dev-subject", value: subject, url }]);
	const page = await context.newPage();
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	return { page, errors, done: () => context.close() };
}

/** Whether the page scrolls sideways (it never should, at any width). */
export const sideways = (page: Page): Promise<boolean> =>
	page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
