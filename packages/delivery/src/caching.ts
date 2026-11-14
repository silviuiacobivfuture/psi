import { createHash } from "node:crypto";
import type { MiddlewareHandler } from "hono";

/** A content-hashed file never changes: a year, and the browser never asks again. */
export const IMMUTABLE = "public, max-age=31536000, immutable";
/** An unhashed asset path: kept a few minutes, then asked again with its ETag (an unchanged file is a 304). */
export const SHORT = "public, max-age=300, must-revalidate";
/** A public page: kept, but asked again every time (a 304 when nothing changed). */
export const PAGE = "no-cache";
/** A page rendered for one signed-in person: never kept anywhere. */
export const PERSONAL = "private, no-store";

/** `name.<8+ hex>.ext`: the content-hashed names this package and the image pipeline emit. */
const HASHED = /\.[0-9a-f]{8,}\.[a-z0-9]+$/i;

export function isHashedPath(path: string): boolean {
	return HASHED.test(path);
}

/** The cache policy of a static file by its path: a year for a content-hashed name, a few minutes for the rest. */
export function staticCacheControl(path: string): string {
	return isHashedPath(path) ? IMMUTABLE : SHORT;
}

/** Whether an `If-None-Match` names this ETag (weak comparison, as RFC 9110 asks for a GET). */
export function etagMatches(etag: string, ifNoneMatch: string | undefined): boolean {
	if (ifNoneMatch === undefined) return false;
	if (ifNoneMatch.trim() === "*") return true;
	const bare = etag.replace(/^W\//, "");
	return (ifNoneMatch.match(/(?:W\/)?"[^"]*"/g) ?? []).some((t) => t.replace(/^W\//, "") === bare);
}

/** What a 304 keeps of the 200 it stands for. */
const KEPT_ON_304 = ["cache-control", "etag", "vary", "expires", "content-location", "date"];

function isPersonal(cacheControl: string | null): boolean {
	return cacheControl !== null && /(^|[,\s])(no-store|private)([,\s=]|$)/i.test(cacheControl);
}

/**
 * Page and validator policy, mounted right after {@link compression} (so it runs on every route's final response,
 * after the account's own `private, no-store` on signed-in pages):
 * - an HTML page that said nothing about caching is `no-cache` with a weak ETag of its bytes, so a revisit is a 304;
 *   a personal page (`private`/`no-store`) is left exactly as it is, with no ETag;
 * - any GET answered with an ETag that the request's `If-None-Match` names becomes a bodiless 304.
 *
 * `pages: "personal"` is for an app whose every page is someone's (a staff console): an HTML page that said nothing
 * is `private, no-store` instead, with no ETag.
 */
export function caching(options: { pages?: "public" | "personal" } = {}): MiddlewareHandler {
	const personalPages = options.pages === "personal";
	return async function cache(c, next) {
		await next();
		if (c.req.method !== "GET" && c.req.method !== "HEAD") return;
		const res = c.res;
		if (res.status !== 200) return;
		const html = (res.headers.get("content-type") ?? "").startsWith("text/html");
		if (html && personalPages && !res.headers.has("cache-control"))
			res.headers.set("cache-control", PERSONAL);
		const cacheControl = res.headers.get("cache-control");
		let etag = res.headers.get("etag");
		if (html && !isPersonal(cacheControl) && etag === null && res.body !== null) {
			const body = new Uint8Array(await res.arrayBuffer());
			etag = `W/"${createHash("sha256").update(body).digest("base64url").slice(0, 22)}"`;
			const headers = new Headers(res.headers);
			headers.set("etag", etag);
			if (cacheControl === null) headers.set("cache-control", PAGE);
			c.res = undefined;
			c.res = new Response(body, { status: 200, statusText: res.statusText, headers });
		}
		if (etag === null || !etagMatches(etag, c.req.header("if-none-match"))) return;
		await c.res.body?.cancel();
		const kept = new Headers();
		for (const name of KEPT_ON_304) {
			const value = c.res.headers.get(name);
			if (value !== null) kept.set(name, value);
		}
		// A cookie the route set (a first visit's visitor key) still reaches the browser.
		for (const cookie of c.res.headers.getSetCookie()) kept.append("set-cookie", cookie);
		c.res = undefined;
		c.res = new Response(null, { status: 304, headers: kept });
	};
}
