import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Hono } from "hono";

const DATASTAR_FILE = createRequire(import.meta.url).resolve("@psi/ui/datastar.js");
const CSS_FILE = fileURLToPath(new URL("../public/assets/app.css", import.meta.url));

/** A content-hashed file never changes: a year, and the browser never asks again. */
const IMMUTABLE = "public, max-age=31536000, immutable";
/** An unhashed path (the offline shell's, an old page's): kept briefly, then asked again. */
const SHORT = "public, max-age=300, must-revalidate";

interface Held {
	body: string;
	hash: string;
	mtimeMs: number;
}

/**
 * A file read once and re-read only when it changes on disk (the stylesheet is rebuilt by `css:watch` in development),
 * with the first 12 hex of its SHA-256: the name a page links it by.
 */
function held(path: string): () => Held {
	let cached: Held | undefined;
	return () => {
		const mtimeMs = statSync(path).mtimeMs;
		if (cached === undefined || cached.mtimeMs !== mtimeMs) {
			const body = readFileSync(path, "utf8");
			cached = {
				body,
				mtimeMs,
				hash: createHash("sha256").update(body).digest("hex").slice(0, 12),
			};
		}
		return cached;
	};
}

const FILES = {
	"app.css": { read: held(CSS_FILE), type: "text/css; charset=utf-8" },
	"datastar.js": { read: held(DATASTAR_FILE), type: "text/javascript; charset=utf-8" },
} as const;
type AssetName = keyof typeof FILES;

/** The content-hashed path a page links the stylesheet or Datastar by: `/assets/app.<hash>.css`. */
export function assetPath(name: AssetName): string {
	const dot = name.lastIndexOf(".");
	return `/assets/${name.slice(0, dot)}.${FILES[name].read().hash}${name.slice(dot)}`;
}

/**
 * Self-hosted Datastar, the built stylesheet, brand images and PWA icons. Pages link the content-hashed names (cached a
 * year, immutable: the service worker serves them cache-first); the plain names the offline shell caches still answer,
 * briefly cached, so a deploy's new stylesheet arrives with its new pages.
 */
export function registerAssets(app: Hono): void {
	for (const [name, file] of Object.entries(FILES))
		app.get(`/assets/${name}`, (c) =>
			c.body(file.read().body, 200, { "content-type": file.type, "cache-control": SHORT }),
		);
	app.get("/assets/:file{[a-z]+\\.[0-9a-f]{12}\\.(?:css|js)}", async (c, next) => {
		const [stem, hash, ext] = c.req.param("file").split(".");
		const file = Object.entries(FILES).find(([name]) => name === `${stem}.${ext}`)?.[1];
		if (file === undefined) return next();
		const now = file.read();
		// An old hash (a page from before a deploy) gets today's file, but is not cached as if it were that one.
		return c.body(now.body, 200, {
			"content-type": file.type,
			"cache-control": hash === now.hash ? IMMUTABLE : SHORT,
		});
	});
	app.use(
		"/assets/*",
		serveStatic({
			root: "./public",
			onFound: (_path, c) => c.header("cache-control", "public, max-age=86400"),
		}),
	);
	app.get("/favicon.svg", serveStatic({ path: "./public/favicon.svg" }));
}
