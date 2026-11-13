import { createAccount, memoryStores } from "@psi/account";
import { type Browser, createBrowser } from "@psi/account/dev/test-browser";
import { type RunningApi, startApi } from "@psi/scheduling-api/testing";
import { createApp } from "../app";
import { devApiSignIn } from "../dev-signin";
import { createFakeNotifications } from "../notifications/fake";
import type { Backoff } from "../port/sdk/live";
import { sdkPortSource } from "../port/sdk/source";
import { createConsolePwa } from "../pwa";

export const ORIGIN = "http://clinic.test";

export interface Session {
	subject: string;
	browser: Browser;
	get(path: string): Promise<Response>;
	post(path: string, body?: BodyInit, headers?: Record<string, string>): Promise<Response>;
	/** The raw app response (a stream stays open): for the live feed. */
	open(path: string): Promise<Response>;
	/** One request, redirects not followed: what the console first answers. */
	raw(path: string, init?: RequestInit): Promise<Response>;
}

export interface SdkConsole {
	api: RunningApi;
	/** A browser signed in as this person of the populated world. */
	as(subject: string): Promise<Session>;
	close(): Promise<void>;
}

/**
 * The real console, over the real scheduling service on a real socket (its in-memory adapters, the populated
 * synthetic clinic), signed in through the development flow: the person's token goes to the service on every call.
 */
export async function startSdkConsole(
	options: { fetch?: typeof globalThis.fetch; backoff?: Backoff } = {},
): Promise<SdkConsole> {
	const api = await startApi();
	const dev = devApiSignIn(api.url, ORIGIN);
	const idle = createAccount({
		site: { slug: "clinic", key: "clinic", origin: ORIGIN, home: "/calendar" },
		stores: memoryStores(),
		onWarn: () => {},
		env: {},
	});
	const pwa = createConsolePwa(ORIGIN, idle);
	const app = createApp({
		ports: sdkPortSource({
			baseUrl: api.url,
			auth: dev.auth,
			...(options.fetch === undefined ? {} : { fetch: options.fetch }),
			...(options.backoff === undefined ? {} : { backoff: options.backoff }),
		}),
		notifications: createFakeNotifications({ seeded: false }),
		viewAsSecret: "v".repeat(40),
		auth: dev.auth,
		pwa,
		origin: ORIGIN,
		mount: (h) => {
			dev.mount(h);
			pwa.mount(h);
		},
	});
	const headers = { origin: ORIGIN, "sec-fetch-site": "same-origin" };
	return {
		api,
		async as(subject) {
			const browser = createBrowser({ [ORIGIN]: (req) => app.fetch(req) });
			const post = async (
				path: string,
				body?: BodyInit,
				extra?: Record<string, string>,
			): Promise<Response> =>
				(
					await browser.go(`${ORIGIN}${path}`, {
						method: "POST",
						...(body === undefined ? {} : { body }),
						headers: { ...headers, ...extra },
					})
				).res;
			await post("/dev/as", new URLSearchParams({ subject }), {
				"content-type": "application/x-www-form-urlencoded",
			});
			return {
				subject,
				browser,
				get: async (path) => (await browser.go(`${ORIGIN}${path}`)).res,
				post,
				open: async (path) =>
					app.fetch(new Request(`${ORIGIN}${path}`, { headers: { cookie: cookieOf(browser) } })),
				raw: async (path, init = {}) =>
					app.fetch(
						new Request(`${ORIGIN}${path}`, {
							...init,
							redirect: "manual",
							headers: { ...headers, ...init.headers, cookie: cookieOf(browser) },
						}),
					),
			};
		},
		close: () => api.close(),
	};
}

const cookieOf = (browser: Browser): string =>
	[...browser.cookies(ORIGIN)].map(([k, v]) => `${k}=${v}`).join("; ");
