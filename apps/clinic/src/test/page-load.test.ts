import { createAccount, memoryStores } from "@psi/account";
import { type RunningApi, startApi } from "@psi/scheduling-api/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { devApiSignIn } from "../dev-signin";
import { createFakeNotifications } from "../notifications/fake";
import { createSdkPort } from "../port/sdk/index";
import { sdkPortSource } from "../port/sdk/source";
import { createConsolePwa } from "../pwa";

/**
 * What one page costs the scheduling service, over the real service (its in-memory adapters, the synthetic clinic):
 * the person's capabilities (~480 OpenFGA checks in service) asked once per page, however many of its parts read them;
 * the lists a page shows asked once, however many of its parts need them; and every page saying where its time went.
 */
let api: RunningApi;
beforeAll(async () => {
	api = await startApi();
}, 60_000);
afterAll(async () => {
	await api.close();
});

const ORIGIN = "http://clinic.test";
const CAPS = /^\/v1\/apps\/[^/]+\/me$/;

/** Every call made to the service, as `METHOD /path`. */
function recorder() {
	const calls: string[] = [];
	const fetchVia: typeof globalThis.fetch = (input, init) => {
		const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
		calls.push(`${(init?.method ?? "GET").toUpperCase()} ${new URL(raw).pathname}`);
		return fetch(input, init);
	};
	return { calls, fetchVia };
}

/** The console over the service, recording every call it makes to it. */
function consoleWith() {
	const { calls, fetchVia } = recorder();
	const dev = devApiSignIn(api.url, ORIGIN);
	const pwa = createConsolePwa(
		ORIGIN,
		createAccount({
			site: { slug: "clinic", key: "clinic", origin: ORIGIN, home: "/calendar" },
			stores: memoryStores(),
			onWarn: () => {},
			env: {},
		}),
	);
	const app = createApp({
		ports: sdkPortSource({ baseUrl: api.url, auth: dev.auth, fetch: fetchVia }),
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
	const page = async (path: string, subject = "olga") => {
		const res = await app.request(`${ORIGIN}${path}`, {
			headers: { cookie: `psi-clinic-dev-subject=${subject}; lang=ro; theme=light` },
		});
		await res.text();
		return res;
	};
	const capsAsked = () => calls.filter((c) => CAPS.test(c.slice(c.indexOf(" ") + 1))).length;
	return { page, calls, capsAsked };
}

const PAGES = [
	"/calendar",
	"/calendar?view=day",
	"/calendar?view=week",
	"/calendar?view=month",
	"/clients",
	"/settings",
	"/settings/audit",
	"/stats",
	"/floor",
	"/roster",
];

describe("a page asks for the person's capabilities once", () => {
	it.each(PAGES)("%s", async (path) => {
		const c = consoleWith();
		expect((await c.page(path)).status).toBe(200);
		expect(c.capsAsked()).toBe(1);
	});

	it("the next page asks again: nothing is kept from one page to the next", async () => {
		const c = consoleWith();
		await c.page("/clients");
		await c.page("/clients");
		expect(c.capsAsked()).toBe(2);
	});

	it("a redirect to the person's landing page asks them once too", async () => {
		const c = consoleWith();
		expect((await c.page("/")).status).toBe(302);
		expect(c.capsAsked()).toBe(1);
	});
});

describe("the lists a page shows are asked once, however many of its parts need them", () => {
	it.each(["/floor", "/calendar?view=week", "/stats", "/settings/audit"])("%s", async (path) => {
		const c = consoleWith();
		await c.page(path);
		for (const list of ["people", "rooms", "devices", "groups", "services"]) {
			const n = c.calls.filter((x) => x === `GET /v1/apps/psizone/${list}`).length;
			expect(n, list).toBeLessThanOrEqual(1);
		}
	});
});

describe("every page says where its time went (Server-Timing)", () => {
	it("the session, the capabilities, the other calls and the service's share, the console's own work, the total", async () => {
		const c = consoleWith();
		const res = await c.page("/calendar?view=week");
		const names = (res.headers.get("server-timing") ?? "")
			.split(",")
			.map((e) => e.trim().split(";")[0]);
		for (const name of ["session", "caps", "api", "svc-auth", "svc-handler", "console", "total"])
			expect(names, name).toContain(name);
		for (const entry of (res.headers.get("server-timing") ?? "").split(","))
			expect(entry).toMatch(/dur=[0-9]+(\.[0-9])?(;|$)/);
	});

	it("a signed-out visit is sent to sign-in, and still says its total", async () => {
		const c = consoleWith();
		const res = await c.page("/calendar", "");
		expect(res.status).toBe(302);
		expect(res.headers.get("server-timing")).toMatch(/total;dur=[0-9.]+/);
		expect(c.calls).toEqual([]);
	});
});

describe("a write forgets what the port read", () => {
	const port = (fetchVia: typeof globalThis.fetch) =>
		createSdkPort({ baseUrl: api.url, bearer: () => api.tokenFor("olga"), fetch: fetchVia });

	it("capabilities and lists are asked once, and again after the port changes something", async () => {
		const { calls, fetchVia } = recorder();
		const olga = port(fetchVia);
		const count = (call: string) => calls.filter((c) => c === call).length;
		await olga.capabilities("olga", "psizone");
		await olga.capabilities("olga", "psizone");
		await olga.columns("psizone");
		await olga.columns("psizone");
		expect([count("GET /v1/apps/psizone/me"), count("GET /v1/apps/psizone/rooms")]).toEqual([1, 1]);
		await olga.saveMySettings("psizone", "olga", await olga.mySettings("psizone", "olga"));
		await olga.capabilities("olga", "psizone");
		await olga.columns("psizone");
		expect([count("GET /v1/apps/psizone/me"), count("GET /v1/apps/psizone/rooms")]).toEqual([2, 2]);
	});

	it("a refused write forgets too: what it may have changed is never assumed", async () => {
		const { calls, fetchVia } = recorder();
		const olga = port(fetchVia);
		await olga.capabilities("olga", "psizone");
		const settings = await olga.mySettings("psizone", "olga");
		await expect(
			olga.saveMySettings("psizone", "olga", { ...settings, calendarView: "year" as "day" }),
		).rejects.toMatchObject({ code: "invalid" });
		await olga.capabilities("olga", "psizone");
		expect(calls.filter((c) => c === "GET /v1/apps/psizone/me").length).toBe(2);
	});

	it("a failed read is asked again, never remembered", async () => {
		let fail = true;
		const { calls, fetchVia } = recorder();
		const flaky: typeof globalThis.fetch = async (input, init) => {
			if (fail) {
				fail = false;
				return new Response(
					JSON.stringify({ error: { code: "unavailable", message: "x", requestId: "r" } }),
					{
						status: 503,
						headers: { "content-type": "application/json" },
					},
				);
			}
			return fetchVia(input, init);
		};
		const olga = port(flaky);
		await expect(olga.capabilities("olga", "psizone")).rejects.toMatchObject({
			code: "unavailable",
		});
		expect((await olga.capabilities("olga", "psizone")).app).toBe("psizone");
		expect(calls.filter((c) => c === "GET /v1/apps/psizone/me").length).toBe(1);
	});
});
