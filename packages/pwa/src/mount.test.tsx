/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { WebAppManifestSchema } from "./manifest";
import { createPwa, type PwaSite } from "./mount";
import type { PushConfig } from "./push/config";
import { memoryPushStore } from "./push/store";
import type { PwaMessages } from "./words";

const say = (word: string) => (_i: unknown, o: { locale: "ro" | "en" }) => `${word} ${o.locale}`;
/** Every PWA key, worded as "<key> <locale>": enough to see which word lands where. */
const M: PwaMessages = {
	pwa_name: say("pwa_name"),
	pwa_short_name: () => "Psizone",
	pwa_description: say("pwa_description"),
	pwa_install: say("pwa_install"),
	pwa_ios_title: say("pwa_ios_title"),
	pwa_ios_steps: say("pwa_ios_steps"),
	pwa_notifications: say("pwa_notifications"),
	pwa_offline_title: say("pwa_offline_title"),
	pwa_offline_lead: say("pwa_offline_lead"),
	pwa_offline_retry: say("pwa_offline_retry"),
	pwa_offline_home: say("pwa_offline_home"),
	pwa_page_title: say("pwa_page_title"),
	pwa_page_lead: say("pwa_page_lead"),
	pwa_topic_articles_hint: say("pwa_topic_articles_hint"),
	pwa_topic_articles_psizone: say("pwa_topic_articles_psizone"),
	pwa_topic_articles_eqsync: say("pwa_topic_articles_eqsync"),
	pwa_topic_articles_hemisync: say("pwa_topic_articles_hemisync"),
	pwa_topic_booking: say("pwa_topic_booking"),
	pwa_topic_booking_hint: say("pwa_topic_booking_hint"),
	pwa_notify_me: say("pwa_notify_me"),
	pwa_notify_stop: say("pwa_notify_stop"),
	pwa_notify_on: say("pwa_notify_on"),
	pwa_sign_in_first: say("pwa_sign_in_first"),
	pwa_unsupported: say("pwa_unsupported"),
	pwa_ios_install: say("pwa_ios_install"),
	pwa_off: say("pwa_off"),
	pwa_denied: say("pwa_denied"),
	pwa_failed: say("pwa_failed"),
	pwa_test: say("pwa_test"),
	pwa_tested: say("pwa_tested"),
	pwa_too_soon: say("pwa_too_soon"),
	pwa_privacy: say("pwa_privacy"),
	pwa_devices_title: say("pwa_devices_title"),
	pwa_devices_empty: say("pwa_devices_empty"),
	pwa_device_remove: say("pwa_device_remove"),
	pwa_device_detail: (i, o) => `since ${i.date}: ${i.topics} ${o.locale}`,
	pwa_push_booking_confirmed_title: say("pwa_push_booking_confirmed_title"),
	pwa_push_booking_confirmed_body: say("pwa_push_booking_confirmed_body"),
	pwa_push_booking_cancelled_title: say("pwa_push_booking_cancelled_title"),
	pwa_push_booking_cancelled_body: say("pwa_push_booking_cancelled_body"),
	pwa_push_booking_reminder_title: say("pwa_push_booking_reminder_title"),
	pwa_push_booking_reminder_body: say("pwa_push_booking_reminder_body"),
	pwa_push_article_title: (i, o) => `new from ${i.brand} ${o.locale}`,
	pwa_push_article_body: (i) => i.headline,
	pwa_push_test_title: say("pwa_push_test_title"),
	pwa_push_test_body: say("pwa_push_test_body"),
};
const SITE: PwaSite = {
	brand: "psizone",
	origin: "http://localhost:4310",
	origins: ["http://localhost:4310", "http://localhost:4340"],
	prefixes: { ro: "", en: "/en" },
	theme: "psizone-light",
	messages: M,
	siteNames: () => ({ psizone: "Psizone", eqsync: "EQ-SYNC", hemisync: "Hemi-Sync", blog: "Blog" }),
	topics: ["booking", "articles:psizone"],
	identity: { session: () => async (_c, next) => next(), current: () => null },
	notificationsPath: (l) => (l === "en" ? "/en/cont/notificari" : "/cont/notificari"),
};
/** Push off, as in production before the keys are seeded. */
const CONFIG: PushConfig = {
	vapid: null,
	notifySecret: null,
	store: async () => memoryPushStore(),
	storage: "off",
	off: "no VAPID keys configured",
};

describe("createPwa", () => {
	const app = new Hono();
	const pwa = createPwa(SITE, CONFIG);
	pwa.mount(app);

	it("serves the worker at the root scope, never cached by HTTP", async () => {
		const res = await app.request("/sw.js");
		expect(res.status).toBe(200);
		expect(res.headers.get("service-worker-allowed")).toBe("/");
		expect(res.headers.get("cache-control")).toBe("no-cache");
		expect(res.headers.get("content-type")).toContain("text/javascript");
		const body = await res.text();
		expect(body.startsWith("self.__PSI_PWA__=")).toBe(true);
		expect(body).toContain('"offline":{"ro":"/offline","en":"/en/offline"}');
	});

	it("serves a valid manifest per locale with one id", async () => {
		const ro = await app.request("/manifest.webmanifest");
		const en = await app.request("/en/manifest.webmanifest");
		expect(ro.headers.get("content-type")).toContain("application/manifest+json");
		const a = WebAppManifestSchema.parse(await ro.json());
		const b = WebAppManifestSchema.parse(await en.json());
		expect([a.id, a.start_url, a.lang]).toEqual(["/", "/", "ro"]);
		expect([b.id, b.start_url, b.lang]).toEqual(["/", "/en", "en"]);
	});

	it("serves the hashed client as immutable, and offline pages per locale", async () => {
		expect(pwa.clientPath).toMatch(/^\/assets\/pwa\/client\.[0-9a-f]{10}\.js$/);
		const client = await app.request(pwa.clientPath);
		expect(client.headers.get("cache-control")).toContain("immutable");
		const off = await app.request("/en/offline");
		expect(off.status).toBe(200);
		const html = await off.text();
		expect(html).toContain('lang="en"');
		expect(html).toContain('name="robots" content="noindex"');
	});

	it("prints head tags without a theme-color (SeoHead owns it) and without a key when push is off", () => {
		const html = String(pwa.head("ro", "/cont/notificari"));
		expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest"/>');
		expect(html).toContain('rel="apple-touch-icon"');
		expect(html).toContain('name="apple-mobile-web-app-capable"');
		expect(html).toContain('content="noindex"');
		expect(html).not.toContain("theme-color");
		expect(html).not.toContain("psi-pwa-vapid");
		expect(String(pwa.head("en", "/en"))).not.toContain("noindex");
	});
});

describe("pages rendered for a signed-in person", () => {
	const who = { subject: "alice", user: "user:alice", email: null, name: null };
	const app = new Hono();
	createPwa(
		{ ...SITE, identity: { session: () => async (_c, next) => next(), current: () => who } },
		CONFIG,
	).mount(app);
	app.get("/contact", (c) => c.html("<p>prefilled</p>"));
	app.get("/kept", (c) => c.html("<p>x</p>", 200, { "cache-control": "public, max-age=60" }));

	it("are marked private, no-store when the route said nothing, so no worker or cache keeps them", async () => {
		expect((await app.request("/contact")).headers.get("cache-control")).toBe("private, no-store");
		expect((await app.request("/kept")).headers.get("cache-control")).toBe("public, max-age=60");
	});

	it("give the worker the app's name for a push it cannot word", async () => {
		const sw = await (await app.request("/sw.js")).text();
		expect(sw).toContain('"names":{"ro":"Psizone","en":"Psizone"}');
	});
});

describe("with push off (production before the keys are seeded)", () => {
	const app = new Hono();
	const pwa = createPwa(SITE, CONFIG);
	pwa.mount(app);

	it("still installs and works offline: worker, manifest and offline page are served", async () => {
		expect((await app.request("/sw.js")).status).toBe(200);
		expect((await app.request("/manifest.webmanifest")).status).toBe(200);
		expect((await app.request("/offline")).status).toBe(200);
	});

	it("shows no Notify me control and no notifications link; the API stores nothing", async () => {
		const page = String(
			pwa.notifications({ locale: "ro", signedIn: true, signInHref: "/", devices: [] }),
		);
		expect(page).toContain("pwa_off ro");
		expect(page).not.toContain("pwa_notify_me");
		expect(page).not.toContain("psiPwa.subscribe");
		const tools = String(pwa.tools("ro"));
		expect(tools).toContain("pwa_install ro");
		expect(tools).not.toContain("/cont/notificari");
		// The site's installPrompt off: no install invitation, no iOS note.
		const quiet = String(pwa.tools("ro", { install: false }));
		expect(quiet).not.toContain("pwa_install ro");
		expect(quiet).not.toContain("pz-pwa-ios");
		const res = await app.request("/pwa/push/subscribe", {
			method: "POST",
			headers: { "content-type": "application/json", origin: SITE.origin },
			body: "{}",
		});
		expect(res.status).toBe(503);
	});
});

describe("the generated bundles", () => {
	it("are up to date with src/worker and src/client", () => {
		const script = fileURLToPath(new URL("../scripts/build-bundles.ts", import.meta.url));
		const out = execFileSync("pnpm", ["exec", "tsx", script, "--check"], {
			cwd: fileURLToPath(new URL("..", import.meta.url)),
			encoding: "utf8",
		});
		expect(out).toContain("bundles up to date");
	});
});
