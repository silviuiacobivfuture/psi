import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { ObjectStat, ObjectStore, SignedLink } from "./objects";

/**
 * Object storage on the local disk, for the local run only: the same signed-link flow as S3, with the bytes landing in a
 * folder of the worktree that git ignores. Nothing here is a production fallback; the configuration refuses a
 * production start with no S3.
 */
export interface FsObjectsOptions {
	/** Where objects live; every key is resolved under it and nothing outside it is ever read, written or removed. */
	root: string;
	/** The origin the signed links point at (the local run itself). */
	publicUrl: string;
	/** Signs the links; a link is good for one method on one key until its expiry. */
	secret: string;
	maxBytes: number;
	now?: () => number;
}

export interface FsObjects extends ObjectStore {
	/** The route behind the signed links: PUT stores the bytes, GET reads them, anything else is refused. */
	handle(request: Request): Promise<Response>;
	/** The browser's side of a signed upload, without a network. */
	upload(url: string, size: number, contentType: string): Promise<void>;
}

/** Up to five segments of letters, digits, `_` and `-`: no dot, so no `..`, and no collision with the type sidecar. */
const KEY = /^[A-Za-z0-9_-]{1,64}(?:\/[A-Za-z0-9_-]{1,64}){0,4}$/;
export const FS_ROUTE = "/dev/objects/";

export function createFsObjects(options: FsObjectsOptions): FsObjects {
	const now = options.now ?? Date.now;
	const root = resolve(options.root);
	const origin = options.publicUrl.replace(/\/+$/, "");

	/** The two files of a key, refused unless they sit under the root. */
	function paths(key: string): { bytes: string; type: string } {
		if (!KEY.test(key)) throw new Error("not an object key");
		const bytes = resolve(join(root, `${key}.bin`));
		if (!bytes.startsWith(root + sep)) throw new Error("not an object key");
		return { bytes, type: `${bytes.slice(0, -4)}.type` };
	}

	const sign = (method: string, key: string, expires: number, name: string): string =>
		createHmac("sha256", options.secret)
			.update(`${method}\n${key}\n${expires}\n${name}`)
			.digest("hex");

	function link(method: "GET" | "PUT", key: string, ttl: number, name = ""): SignedLink {
		paths(key);
		const expiresAt = now() + ttl * 1000;
		const query = new URLSearchParams({
			exp: String(expiresAt),
			sig: sign(method, key, expiresAt, name),
		});
		if (name !== "") query.set("name", name);
		return { url: `${origin}${FS_ROUTE}${key}?${query}`, expiresAt };
	}

	function valid(method: string, key: string, params: URLSearchParams): boolean {
		const expires = Number(params.get("exp"));
		const given = Buffer.from(params.get("sig") ?? "", "hex");
		const wanted = Buffer.from(sign(method, key, expires, params.get("name") ?? ""), "hex");
		return (
			Number.isSafeInteger(expires) &&
			expires > now() &&
			given.length === wanted.length &&
			timingSafeEqual(given, wanted)
		);
	}

	async function head(key: string): Promise<ObjectStat | undefined> {
		const where = paths(key);
		const info = await stat(where.bytes).catch(() => undefined);
		if (info === undefined || !info.isFile()) return undefined;
		const type = await readFile(where.type, "utf8").catch(() => undefined);
		return { size: info.size, contentType: type };
	}

	const refuse = (status: number, text: string): Response => new Response(text, { status });

	async function put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
		const where = paths(key);
		await mkdir(dirname(where.bytes), { recursive: true });
		await writeFile(where.bytes, bytes);
		await writeFile(where.type, contentType);
	}

	const store: FsObjects = {
		signUpload: (key, _type, ttl) => link("PUT", key, ttl),
		signDownload: (key, ttl, name) => link("GET", key, ttl, name),
		head,
		async remove(key) {
			const where = paths(key);
			await rm(where.bytes, { force: true });
			await rm(where.type, { force: true });
		},
		async upload(url, size, contentType) {
			const target = new URL(url);
			const res = await store.handle(
				new Request(target, {
					method: "PUT",
					headers: { "content-type": contentType },
					body: new Uint8Array(size),
				}),
			);
			if (!res.ok) throw new Error(`the local object route answered ${res.status}`);
		},
		async handle(request) {
			const url = new URL(request.url);
			if (!url.pathname.startsWith(FS_ROUTE)) return refuse(404, "not found");
			const key = decodeURIComponent(url.pathname.slice(FS_ROUTE.length));
			if (!KEY.test(key)) return refuse(400, "not an object key");
			if (request.method !== "PUT" && request.method !== "GET") return refuse(405, "not allowed");
			if (!valid(request.method, key, url.searchParams))
				return refuse(403, "the link is not valid");
			if (request.method === "PUT") {
				const bytes = new Uint8Array(await request.arrayBuffer());
				if (bytes.length > options.maxBytes) return refuse(413, "too large");
				const type = (request.headers.get("content-type") ?? "application/octet-stream")
					.split(";")[0]
					?.trim();
				await put(key, bytes, type ?? "application/octet-stream");
				return new Response(null, { status: 204 });
			}
			const held = await head(key);
			if (held === undefined) return refuse(404, "not found");
			const name = (url.searchParams.get("name") ?? "file").replace(/["\\\r\n]/g, "_");
			return new Response(await readFile(paths(key).bytes), {
				status: 200,
				headers: {
					"content-type": held.contentType ?? "application/octet-stream",
					"content-disposition": `attachment; filename="${name}"`,
				},
			});
		},
	};
	return store;
}
