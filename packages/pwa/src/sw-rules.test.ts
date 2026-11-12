import { describe, expect, it } from "vitest";
import {
	cacheName,
	localeOf,
	neverCached,
	type RequestFacts,
	staleCaches,
	storable,
	strategyFor,
	unlocalised,
} from "./sw-rules";

const ORIGIN = "https://psizone.ro";
const nav = (path: string, method = "GET"): RequestFacts => ({
	method,
	url: `${ORIGIN}${path}`,
	mode: "navigate",
	accept: "text/html,application/xhtml+xml",
});
const fetchOf = (path: string, accept = "*/*", method = "GET"): RequestFacts => ({
	method,
	url: `${ORIGIN}${path}`,
	mode: "cors",
	accept,
});
const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });

describe("what is NEVER cached", () => {
	it.each([
		"/ghid",
		"/en/ghid",
		"/cont",
		"/cont/notificari",
		"/en/cont",
		"/cont/salvate/nou",
		"/auth/sign-in",
		"/auth/callback",
		"/programare",
		"/programare/confirma",
		"/pwa/push/subscribe",
		"/__pwa/notify",
		"/__cms/revalidate",
		"/_preview/abc",
		"/_a",
		"/sw.js",
		"/manifest.webmanifest",
		"/en/manifest.webmanifest",
		"/healthz",
	])("%s bypasses the worker", (path) => {
		expect(neverCached(path)).toBe(true);
		expect(strategyFor(nav(path), ORIGIN)).toBe("bypass");
		expect(strategyFor(fetchOf(path), ORIGIN)).toBe("bypass");
	});

	it("bypasses every non-GET, wherever it goes", () => {
		for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
			expect(strategyFor(nav("/", method), ORIGIN)).toBe("bypass");
			expect(strategyFor(fetchOf("/assets/app.css", "*/*", method), ORIGIN)).toBe("bypass");
		}
	});

	it("bypasses the guide's event stream, whatever its path", () => {
		expect(strategyFor(fetchOf("/en/ghid?target=compass", "text/event-stream"), ORIGIN)).toBe(
			"bypass",
		);
		expect(strategyFor(fetchOf("/anything", "text/event-stream"), ORIGIN)).toBe("bypass");
	});

	it("bypasses other origins (fonts, the CMS, other estate sites)", () => {
		expect(
			strategyFor({ ...nav("/"), url: "https://fonts.googleapis.com/css2?family=x" }, ORIGIN),
		).toBe("bypass");
		expect(strategyFor({ ...nav("/"), url: "https://blog.psizone.ro/" }, ORIGIN)).toBe("bypass");
	});

	it("matches whole segments: /contact and /continut are pages, not the account", () => {
		expect(neverCached("/contact")).toBe(false);
		expect(neverCached("/en/contact")).toBe(false);
		expect(neverCached("/ghiduri")).toBe(false);
		expect(strategyFor(nav("/contact"), ORIGIN)).toBe("page");
	});
});

describe("what is cached, and how", () => {
	it("pages are network first", () => {
		for (const p of ["/", "/en", "/metode", "/en/articles/somn", "/offline", "/en/offline"]) {
			expect(strategyFor(nav(p), ORIGIN)).toBe("page");
		}
	});

	it("content-hashed /assets/ files are cache first", () => {
		expect(
			strategyFor(fetchOf("/assets/brand/pz-adults-armchair-1200.176eec4c90.avif"), ORIGIN),
		).toBe("immutable");
		expect(strategyFor(fetchOf("/assets/pwa/client.0a1b2c3d4e.js"), ORIGIN)).toBe("immutable");
	});

	it("unhashed /assets/ files go to the network first (the kept copy only offline)", () => {
		for (const p of ["/assets/app.css", "/assets/datastar.js", "/assets/pwa/icon-192.png"]) {
			expect(strategyFor(fetchOf(p), ORIGIN)).toBe("asset");
		}
	});

	it("leaves other non-page requests to the network", () => {
		expect(strategyFor(fetchOf("/sitemap.xml", "application/xml"), ORIGIN)).toBe("bypass");
		expect(strategyFor(fetchOf("/rss.xml", "application/rss+xml"), ORIGIN)).toBe("bypass");
	});
});

describe("storable", () => {
	const ok = { status: 200, type: "basic" };
	it("keeps a plain 200", () => {
		expect(storable({ ...ok, headers: headers({ "cache-control": "public, max-age=60" }) })).toBe(
			true,
		);
		expect(storable({ ...ok, headers: headers({}) })).toBe(true);
	});
	it("never keeps private, no-store, partial or opaque responses", () => {
		expect(storable({ ...ok, headers: headers({ "cache-control": "private, no-store" }) })).toBe(
			false,
		);
		expect(storable({ ...ok, headers: headers({ "cache-control": "no-store" }) })).toBe(false);
		expect(storable({ ...ok, headers: headers({ "cache-control": "private" }) })).toBe(false);
		expect(storable({ status: 206, type: "basic", headers: headers({}) })).toBe(false);
		expect(storable({ status: 404, type: "basic", headers: headers({}) })).toBe(false);
		expect(storable({ status: 200, type: "opaque", headers: headers({}) })).toBe(false);
	});
});

describe("versioned caches", () => {
	it("names caches per site, kind and version", () => {
		expect(cacheName("psizone", "pages", "abc")).toBe("psi-pwa-psizone-pages-abc");
	});
	it("deletes only this site's caches from other versions", () => {
		const names = [
			"psi-pwa-psizone-shell-old",
			"psi-pwa-psizone-pages-old",
			"psi-pwa-psizone-shell-new",
			"psi-pwa-blog-shell-old",
			"something-else",
		];
		expect(staleCaches(names, "psizone", "new")).toEqual([
			"psi-pwa-psizone-shell-old",
			"psi-pwa-psizone-pages-old",
		]);
	});
});

describe("locales", () => {
	it("strips the English prefix and tells the locale", () => {
		expect(unlocalised("/en/cont")).toBe("/cont");
		expect(unlocalised("/en")).toBe("/");
		expect(unlocalised("/energie")).toBe("/energie");
		expect(localeOf("/en/x")).toBe("en");
		expect(localeOf("/energie")).toBe("ro");
	});
});
