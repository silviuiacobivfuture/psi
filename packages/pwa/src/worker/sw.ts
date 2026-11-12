/// <reference lib="webworker" />
/**
 * The service worker every psi site serves at /sw.js (scope "/"), bundled by
 * `scripts/build-bundles.ts`; the server prepends `self.__PSI_PWA__` (worker-config.ts).
 * Routing decisions come from ../sw-rules.ts, the file the tests hold to account.
 */
import type { PushPayload } from "../push/types";
import { cacheName, localeOf, MAX_PAGES, staleCaches, storable, strategyFor } from "../sw-rules";
import type { WorkerConfig } from "../worker-config";

declare const self: ServiceWorkerGlobalScope & { __PSI_PWA__: WorkerConfig };

const C = self.__PSI_PWA__;
const SHELL = cacheName(C.site, "shell", C.version);
const PAGES = cacheName(C.site, "pages", C.version);
const ASSETS = cacheName(C.site, "assets", C.version);

self.addEventListener("install", (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(SHELL);
			// The offline pages must be there; the rest is best effort.
			await cache.addAll(Object.values(C.offline));
			await Promise.all(C.shell.map((url) => cache.add(url).catch(() => undefined)));
			await self.skipWaiting();
		})(),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			for (const name of staleCaches(await caches.keys(), C.site, C.version)) {
				await caches.delete(name);
			}
			await self.clients.claim();
		})(),
	);
});

async function trim(cache: Cache): Promise<void> {
	const keys = await cache.keys();
	for (const old of keys.slice(0, Math.max(0, keys.length - MAX_PAGES))) await cache.delete(old);
}

async function page(request: Request): Promise<Response> {
	const cache = await caches.open(PAGES);
	try {
		const fresh = await fetch(request);
		if (storable(fresh)) {
			await cache.put(request, fresh.clone());
			await trim(cache);
		}
		return fresh;
	} catch {
		const kept = await cache.match(request, { ignoreVary: true });
		if (kept !== undefined) return kept;
		const offline = await caches.match(C.offline[localeOf(new URL(request.url).pathname)]);
		return offline ?? Response.error();
	}
}

async function immutable(request: Request): Promise<Response> {
	const kept = await caches.match(request);
	if (kept !== undefined) return kept;
	const fresh = await fetch(request);
	if (storable(fresh)) await (await caches.open(ASSETS)).put(request, fresh.clone());
	return fresh;
}

async function asset(request: Request): Promise<Response> {
	try {
		const fresh = await fetch(request);
		if (storable(fresh)) await (await caches.open(ASSETS)).put(request, fresh.clone());
		return fresh;
	} catch {
		return (await caches.match(request)) ?? Response.error();
	}
}

self.addEventListener("fetch", (event) => {
	const req = event.request;
	const strategy = strategyFor(
		{ method: req.method, url: req.url, mode: req.mode, accept: req.headers.get("accept") ?? "" },
		self.location.origin,
	);
	// Never cached: no respondWith at all, so the browser goes to the network untouched.
	if (strategy === "bypass") return;
	if (strategy === "page") event.respondWith(page(req));
	else if (strategy === "immutable") event.respondWith(immutable(req));
	else event.respondWith(asset(req));
});

/** Reads a push payload without trusting it: anything malformed shows nothing. */
function parsePayload(data: PushMessageData | null): PushPayload | null {
	if (data === null) return null;
	try {
		const p: unknown = data.json();
		if (typeof p !== "object" || p === null) return null;
		const kind = Reflect.get(p, "kind");
		const locale = Reflect.get(p, "locale");
		const url = Reflect.get(p, "url");
		const tag = Reflect.get(p, "tag");
		if (Reflect.get(p, "v") !== 1 || typeof url !== "string" || typeof tag !== "string")
			return null;
		if (locale !== "ro" && locale !== "en") return null;
		const known = [
			"booking.confirmed",
			"booking.cancelled",
			"booking.reminder",
			"article.published",
			"test",
		] as const;
		const k = known.find((x) => x === kind);
		if (k === undefined) return null;
		const brand = Reflect.get(p, "brand");
		const headline = Reflect.get(p, "headline");
		return {
			v: 1,
			kind: k,
			locale,
			url,
			tag,
			...(brand === "psizone" || brand === "eqsync" || brand === "hemisync" ? { brand } : {}),
			...(typeof headline === "string" ? { headline } : {}),
		};
	} catch {
		return null;
	}
}

function fill(text: string, p: PushPayload): string {
	const brand = p.brand !== undefined ? C.brandNames[p.locale][p.brand] : "";
	return text.replaceAll("{brand}", brand).replaceAll("{headline}", p.headline ?? "");
}

/** Same site, or an estate site; anything else opens the site's home. */
function safeTarget(url: string): string {
	try {
		const target = new URL(url, self.location.origin);
		return C.origins.includes(target.origin) || target.origin === self.location.origin
			? target.href
			: self.location.origin;
	} catch {
		return self.location.origin;
	}
}

/**
 * A push always shows something: browsers revoke a subscription whose pushes show nothing. A
 * payload this worker cannot read, or a kind it has no words for (an older worker), shows the
 * site's name and leads home — never anything from the payload.
 */
self.addEventListener("push", (event) => {
	const p = parsePayload(event.data);
	const words = p === null ? undefined : C.texts[p.locale][p.kind];
	const locale = p?.locale ?? "ro";
	const shown =
		p !== null && words !== undefined
			? {
					title: fill(words.title, p),
					body: fill(words.body, p).trim(),
					tag: p.tag,
					url: safeTarget(p.url),
				}
			: { title: C.names[locale], body: "", tag: "psi", url: self.location.origin };
	event.waitUntil(
		self.registration.showNotification(shown.title, {
			body: shown.body,
			icon: C.icon,
			badge: C.badge,
			tag: shown.tag,
			lang: locale,
			data: { url: shown.url },
		}),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const data: unknown = event.notification.data;
	const raw = typeof data === "object" && data !== null ? Reflect.get(data, "url") : undefined;
	const url = safeTarget(typeof raw === "string" ? raw : "/");
	event.waitUntil(
		(async () => {
			const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
			const same = open.find((w) => w.url === url);
			if (same !== undefined) return void (await same.focus());
			await self.clients.openWindow(url);
		})(),
	);
});
