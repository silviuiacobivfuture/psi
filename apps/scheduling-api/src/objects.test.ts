import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createS3Store } from "./ports/objects";
import { createFsObjects, FS_ROUTE, type FsObjects } from "./ports/objects-fs";

const NOW = Date.UTC(2026, 10, 13, 8);

describe("the S3 store's head", () => {
	const store = (answer: Response) => {
		const seen: { url: string; method: string }[] = [];
		const s3 = createS3Store({
			endpoint: "https://s3.test",
			bucket: "b",
			region: "eu",
			accessKeyId: "AK",
			secretAccessKey: "SK",
			now: () => NOW,
			fetch: async (url, init) => {
				seen.push({ url: String(url), method: init?.method ?? "GET" });
				return answer;
			},
		});
		return { s3, seen };
	};

	it("asks with a signed HEAD for the one key, and reports the size and the type the store holds", async () => {
		const { s3, seen } = store(
			new Response(null, {
				status: 200,
				headers: { "content-length": "1234", "content-type": "application/pdf; charset=binary" },
			}),
		);
		expect(await s3.head("psizone/c1/o1")).toEqual({ size: 1234, contentType: "application/pdf" });
		expect(seen).toHaveLength(1);
		expect(seen[0]?.method).toBe("HEAD");
		expect(seen[0]?.url).toContain("/b/psizone/c1/o1?");
		expect(seen[0]?.url).toMatch(/X-Amz-Signature=[0-9a-f]{64}$/);
	});

	it("says nothing is stored on a 404, and fails on any other refusal rather than guessing", async () => {
		expect(await store(new Response(null, { status: 404 })).s3.head("a/b/c")).toBeUndefined();
		await expect(store(new Response(null, { status: 403 })).s3.head("a/b/c")).rejects.toThrow(
			"object storage answered 403",
		);
		await expect(store(new Response(null, { status: 500 })).s3.head("a/b/c")).rejects.toThrow(
			"object storage answered 500",
		);
	});

	it("refuses an answer with no size", async () => {
		await expect(store(new Response(null, { status: 200 })).s3.head("a/b/c")).rejects.toThrow(
			"did not say the size",
		);
	});
});

describe("the local filesystem store", () => {
	let root: string;
	let clock = NOW;
	let fs: FsObjects;
	const put = (url: string, bytes: number, type = "application/pdf", method = "PUT") =>
		fs.handle(
			new Request(url, { method, headers: { "content-type": type }, body: new Uint8Array(bytes) }),
		);

	beforeAll(async () => {
		root = await mkdtemp(join(tmpdir(), "psi-objects-"));
		fs = createFsObjects({
			root,
			publicUrl: "http://localhost:4380",
			secret: "test-secret",
			maxBytes: 1000,
			now: () => clock,
		});
	});
	afterAll(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("takes the bytes through a signed upload, then reports their size and type, and gives them back", async () => {
		const up = fs.signUpload("psizone/c1/o1", "application/pdf", 900);
		expect(up.url.startsWith(`http://localhost:4380${FS_ROUTE}psizone/c1/o1?`)).toBe(true);
		expect(up.expiresAt).toBe(NOW + 900_000);
		expect(await fs.head("psizone/c1/o1")).toBeUndefined();
		expect((await put(up.url, 10)).status).toBe(204);
		expect(await fs.head("psizone/c1/o1")).toEqual({ size: 10, contentType: "application/pdf" });
		const down = await fs.handle(new Request(fs.signDownload("psizone/c1/o1", 300, 'a"b.pdf').url));
		expect(down.status).toBe(200);
		expect(down.headers.get("content-type")).toBe("application/pdf");
		expect(down.headers.get("content-disposition")).toBe('attachment; filename="a_b.pdf"');
		expect((await down.arrayBuffer()).byteLength).toBe(10);
	});

	it("refuses a link that is expired, for the other method, tampered with, or unsigned; nothing is written", async () => {
		const before = await readdir(root, { recursive: true });
		const up = fs.signUpload("psizone/c2/o2", "image/png", 60);
		const asGet = new Request(up.url, { method: "GET" });
		expect((await fs.handle(asGet)).status).toBe(403);
		const other = new URL(up.url);
		other.pathname = `${FS_ROUTE}psizone/c2/o3`;
		expect((await put(other.toString(), 5)).status).toBe(403);
		const forged = new URL(up.url);
		forged.searchParams.set("exp", String(NOW + 9_999_999_999));
		expect((await put(forged.toString(), 5)).status).toBe(403);
		const bare = new URL(up.url);
		bare.search = "";
		expect((await put(bare.toString(), 5)).status).toBe(403);
		clock = NOW + 61_000;
		expect((await put(up.url, 5)).status).toBe(403);
		clock = NOW;
		expect(await readdir(root, { recursive: true })).toEqual(before);
		expect(await fs.head("psizone/c2/o2")).toBeUndefined();
	});

	it("refuses a body past the limit and keeps nothing of it", async () => {
		const up = fs.signUpload("psizone/c3/o4", "application/pdf", 60);
		expect((await put(up.url, 1001)).status).toBe(413);
		expect(await fs.head("psizone/c3/o4")).toBeUndefined();
		expect((await put(up.url, 1000)).status).toBe(204);
	});

	it.each([
		"../escape",
		"a/../../escape",
		"/etc/passwd",
		"a//b",
		"a/b.c",
		"",
		"a/b/c/d/e/f",
		"a b",
		"a/b%2e%2e",
	])("never touches a path outside the root: the key %j is no key", async (key) => {
		expect(() => fs.signUpload(key, "application/pdf", 60)).toThrow("not an object key");
		await expect(fs.head(key)).rejects.toThrow("not an object key");
		await expect(fs.remove(key)).rejects.toThrow("not an object key");
		const outside = await fs.handle(
			new Request(`http://localhost:4380${FS_ROUTE}${key}?exp=${NOW + 1000}&sig=00`, {
				method: "PUT",
				body: new Uint8Array(1),
			}),
		);
		expect([400, 403, 404]).toContain(outside.status);
	});

	it("answers 404 for a route that is not an object and 405 for any other method", async () => {
		expect((await fs.handle(new Request("http://localhost:4380/elsewhere"))).status).toBe(404);
		const up = fs.signUpload("psizone/c4/o5", "application/pdf", 60);
		expect((await put(up.url, 1, "application/pdf", "DELETE")).status).toBe(405);
	});

	it("removes the bytes and their type, and removing what is not there is no error", async () => {
		await fs.remove("psizone/c1/o1");
		expect(await fs.head("psizone/c1/o1")).toBeUndefined();
		await expect(stat(join(root, "psizone/c1/o1.bin"))).rejects.toThrow();
		await expect(stat(join(root, "psizone/c1/o1.type"))).rejects.toThrow();
		await expect(fs.remove("psizone/c1/o1")).resolves.toBeUndefined();
	});
});
