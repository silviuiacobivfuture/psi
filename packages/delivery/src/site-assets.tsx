/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { statSync } from "node:fs";
import { createRequire } from "node:module";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Context, Hono, MiddlewareHandler } from "hono";
import { raw } from "hono/html";
import type { JSX } from "hono/jsx/jsx-runtime";
import { caching, IMMUTABLE, SHORT, staticCacheControl } from "./caching";
import { compression } from "./compression";
import { negotiate, varyOnEncoding } from "./encoding";
import { type FontFamily, fontFaces } from "./fonts";
import { type FileVersion, heldFile } from "./held-file";

/** The files a page links by content hash: the site's built stylesheet and the self-hosted Datastar. */
const NAMES = ["app.css", "datastar.js"] as const;
export type AssetName = (typeof NAMES)[number];

export interface SiteAssetsOptions {
	/** Absolute path of the site's built stylesheet (`public/assets/app.css`). */
	stylesheet: string;
	/** The site's public folder: `/assets/*`, `/images/*` and `/favicon.svg` are served from it. */
	publicRoot: string;
	/** The brand faces the site's stylesheet names. */
	fonts: ReadonlyArray<FontFamily>;
	/** The faces drawn above the fold, preloaded (`fraunces-latin.woff2`); the rest load as text needs them. */
	preload: ReadonlyArray<string>;
}

export interface SiteAssets {
	/** The content-hashed path a page links the stylesheet or Datastar by: `/assets/app.<hash>.css`. */
	path(name: AssetName): string;
	/** The head's asset tags: font preloads and faces, the stylesheet, Datastar. */
	Head(): JSX.Element;
	/** The asset routes alone (a console that mounts its own middleware order). */
	routes(app: Hono): void;
	/** Compression, page caching and the asset routes: the first thing a site mounts. */
	mount(app: Hono): void;
}

const TYPES: Record<AssetName, string> = {
	"app.css": "text/css; charset=utf-8",
	"datastar.js": "text/javascript; charset=utf-8",
};

const hashedName = (file: string, hash: string): string => {
	const dot = file.indexOf(".");
	return `${file.slice(0, dot)}.${hash}${file.slice(dot)}`;
};

/** One held version, encoded as the request accepts (squeezed once per version), with its validator. */
async function send(
	c: Context,
	now: FileVersion,
	type: string,
	cacheControl: string,
): Promise<Response> {
	const headers = new Headers({ "content-type": type, "cache-control": cacheControl });
	// A woff2 is compressed inside already; text varies by the encoding it is sent in.
	const text = !type.startsWith("font/");
	const enc = text ? negotiate(c.req.header("accept-encoding")) : null;
	if (text) varyOnEncoding(headers);
	headers.set("etag", enc === null ? `"${now.hash}"` : `W/"${now.hash}"`);
	const body = enc === null ? now.body : await now.encoded(enc);
	if (enc !== null) headers.set("content-encoding", enc);
	headers.set("content-length", String(body.byteLength));
	return new Response(body, { status: 200, headers });
}

/**
 * How a site's files travel. Pages link the stylesheet, Datastar and the fonts by content hash (a year, immutable; the
 * service worker serves them cache-first); the plain names the offline shell caches still answer, briefly cached with
 * an ETag, so a deploy's new stylesheet arrives with its new pages. Images named by hash (the image pipeline's) are
 * immutable too; the rest of `public/` is kept a few minutes and revalidated by ETag.
 */
export function siteAssets(options: SiteAssetsOptions): SiteAssets {
	const files: Record<AssetName, () => FileVersion> = {
		"app.css": heldFile(options.stylesheet),
		"datastar.js": heldFile(createRequire(import.meta.url).resolve("@psi/ui/datastar.js")),
	};
	const faces = fontFaces(options.fonts).map((face) => {
		const read = heldFile(face.path);
		return { ...face, read, href: () => `/assets/fonts/${hashedName(face.file, read().hash)}` };
	});
	for (const name of options.preload)
		if (!faces.some((f) => f.file === name))
			throw new Error(`siteAssets: preload ${name} is not one of the site's font faces`);

	const path = (name: AssetName): string => `/assets/${hashedName(name, files[name]().hash)}`;

	function routes(app: Hono): void {
		for (const name of NAMES)
			app.get(`/assets/${name}`, (c) => send(c, files[name](), TYPES[name], SHORT));
		app.get("/assets/:file{[a-z]+\\.[0-9a-f]{12}\\.(?:css|js)}", async (c, next) => {
			const [stem, hash, ext] = c.req.param("file").split(".");
			const name = `${stem}.${ext}`;
			if (name !== "app.css" && name !== "datastar.js") return next();
			const now = files[name]();
			// An old hash (a page from before a deploy) gets today's file, but is not cached as if it were that one.
			return send(c, now, TYPES[name], hash === now.hash ? IMMUTABLE : SHORT);
		});
		app.get("/assets/fonts/:file{[a-z0-9-]+\\.[0-9a-f]{12}\\.woff2}", async (c, next) => {
			const [stem, hash] = c.req.param("file").split(".");
			const face = faces.find((f) => f.file === `${stem}.woff2`);
			if (face === undefined) return next();
			const now = face.read();
			return send(c, now, "font/woff2", hash === now.hash ? IMMUTABLE : SHORT);
		});
		const found = new WeakMap<Context, string>();
		const serve = serveStatic({
			root: options.publicRoot,
			onFound: (file, c) => {
				found.set(c, file);
			},
		});
		// The file's policy by its name, and a validator from its size and time (what nginx sends).
		const fromPublic: MiddlewareHandler = async (c, next) => {
			const res = await serve(c, next);
			const file = found.get(c);
			if (!(res instanceof Response) || file === undefined) return res;
			const { size, mtimeMs } = statSync(file);
			res.headers.set("cache-control", staticCacheControl(c.req.path));
			res.headers.set("etag", `"${size.toString(16)}-${Math.floor(mtimeMs).toString(16)}"`);
			return res;
		};
		app.use("/assets/*", fromPublic);
		app.use("/images/*", fromPublic);
		app.get("/favicon.svg", fromPublic);
	}

	function Head(): JSX.Element {
		const css = faces.map((f) => f.rule(f.href())).join("");
		return (
			<>
				{faces
					.filter((f) => options.preload.includes(f.file))
					.map((f) => (
						<link rel="preload" href={f.href()} as="font" type="font/woff2" crossorigin="" />
					))}
				<style>{raw(css)}</style>
				<link rel="stylesheet" href={path("app.css")} />
				<script type="module" src={path("datastar.js")} />
			</>
		);
	}

	return {
		path,
		Head,
		routes,
		mount(app) {
			app.use("*", compression());
			app.use("*", caching());
			routes(app);
		},
	};
}
