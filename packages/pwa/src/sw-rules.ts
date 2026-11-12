/**
 * The service worker's routing rules, pure so they are unit-tested exactly as they ship (the worker
 * bundle imports this file). Nothing here touches a cache: it only decides.
 *
 * - `bypass`: the worker does not answer (no `respondWith`), so the browser goes to the network
 *   as if no worker existed — every non-GET, every other origin, event streams, and the routes
 *   that must never be cached: the guide (`/ghid`), the account (`/cont`), sign-in (`/auth`),
 *   bookings (`/programare`), the CMS hooks, previews, beacons and the push API.
 * - `page`: network first; a fresh copy is kept for offline, and with no network the cached copy
 *   or the offline page answers.
 * - `immutable`: cache first — content-hashed files under /assets/ never change.
 * - `asset`: network first, the kept copy only offline — unhashed /assets/ files (app.css,
 *   datastar.js, icons), so a deploy's new stylesheet arrives with its new pages.
 */
export type Strategy = "bypass" | "page" | "immutable" | "asset";

export interface RequestFacts {
	method: string;
	/** Absolute URL. */
	url: string;
	/** `navigate` for a page load. */
	mode: string;
	/** The `Accept` header, or "". */
	accept: string;
}

/**
 * Path prefixes (after the locale prefix is removed) that are never cached. A prefix matches the
 * path itself and anything under it: `/cont` matches `/cont` and `/cont/notificari`, not `/contact`.
 */
export const NEVER_CACHED: ReadonlyArray<string> = [
	"/auth",
	"/cont",
	"/ghid",
	"/programare",
	"/pwa",
	"/__cms",
	"/__pwa",
	"/_preview",
	"/_a",
	"/sw.js",
	"/manifest.webmanifest",
	"/healthz",
];

/** Locale prefixes a path may start with. */
export const LOCALE_PREFIXES: ReadonlyArray<string> = ["/en"];

/** `name.<10+ hex>.ext`: the content-hashed files the image pipeline and this package emit. */
const HASHED = /\.[0-9a-f]{8,}\.[a-z0-9]+$/i;

function underPrefix(path: string, prefix: string): boolean {
	return path === prefix || path.startsWith(`${prefix}/`);
}

/** The path without its locale prefix: `/en/cont` → `/cont`, `/en` → `/`. */
export function unlocalised(path: string): string {
	for (const p of LOCALE_PREFIXES) {
		if (underPrefix(path, p)) return path.slice(p.length) || "/";
	}
	return path;
}

/** The locale a path belongs to (`/en/...` → `en`, anything else → `ro`). */
export function localeOf(path: string): "ro" | "en" {
	return underPrefix(path, "/en") ? "en" : "ro";
}

export function neverCached(path: string): boolean {
	const bare = unlocalised(path);
	return NEVER_CACHED.some((p) => underPrefix(bare, p));
}

/** What the worker does with one request from a page of `origin`. */
export function strategyFor(req: RequestFacts, origin: string): Strategy {
	if (req.method !== "GET") return "bypass";
	const url = new URL(req.url);
	if (url.origin !== origin) return "bypass";
	if (req.accept.includes("text/event-stream")) return "bypass";
	if (neverCached(url.pathname)) return "bypass";
	if (url.pathname.startsWith("/assets/")) {
		return HASHED.test(url.pathname) ? "immutable" : "asset";
	}
	if (req.mode === "navigate" || req.accept.includes("text/html")) return "page";
	return "bypass";
}

/**
 * Whether a response may be kept: a complete, same-origin 200 that does not say `no-store` or
 * `private`. Every page rendered for a signed-in person says both (`pwa.mount` adds them when a
 * route did not). A worker never sees `Set-Cookie`, so that header cannot be relied on here.
 */
export function storable(res: {
	status: number;
	type: string;
	headers: { get(name: string): string | null };
}): boolean {
	if (res.status !== 200 || (res.type !== "basic" && res.type !== "default")) return false;
	const cc = (res.headers.get("cache-control") ?? "").toLowerCase();
	return !/(^|[,\s])(no-store|private)([,\s=]|$)/.test(cc);
}

/** Cache names: `psi-pwa-<site>-<kind>-<version>`; anything else with the site's prefix is old. */
export function cacheName(
	site: string,
	kind: "shell" | "pages" | "assets",
	version: string,
): string {
	return `psi-pwa-${site}-${kind}-${version}`;
}

/** The caches an activating worker deletes: this site's, from any other version. */
export function staleCaches(
	names: ReadonlyArray<string>,
	site: string,
	version: string,
): ReadonlyArray<string> {
	const mine = `psi-pwa-${site}-`;
	return names.filter((n) => n.startsWith(mine) && !n.endsWith(`-${version}`));
}

/** How many visited pages are kept for offline reading; the oldest go first. */
export const MAX_PAGES = 40;
