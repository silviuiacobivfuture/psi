import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Hono } from "hono";

const DATASTAR = readFileSync(
	createRequire(import.meta.url).resolve("@psi/ui/datastar.js"),
	"utf8",
);

/** Self-hosted Datastar, the built stylesheet, brand images and PWA icons — served at the exact paths the service worker caches. */
export function registerAssets(app: Hono): void {
	app.get("/assets/datastar.js", (c) =>
		c.body(DATASTAR, 200, {
			"content-type": "text/javascript; charset=utf-8",
			"cache-control": "public, max-age=86400",
		}),
	);
	app.use("/assets/*", serveStatic({ root: "./public" }));
	app.get("/favicon.svg", serveStatic({ path: "./public/favicon.svg" }));
}
