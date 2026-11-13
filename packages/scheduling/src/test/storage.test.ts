import { createServer, type IncomingMessage } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	createS3Storage,
	MemoryStorage,
	type ObjectStorage,
	readStorageEnv,
	StorageError,
} from "../storage";
import { authorization, encodeKey, sha256 } from "../storage/sigv4";

const BYTES = new Uint8Array([1, 2, 3, 250]);

describe("SigV4", () => {
	it("matches AWS's published example (GET Object with a Range header)", async () => {
		const signed = await authorization({
			method: "GET",
			host: "examplebucket.s3.amazonaws.com",
			path: "/test.txt",
			headers: {
				range: "bytes=0-9",
				"x-amz-content-sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
			},
			payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
			amzDate: "20130524T000000Z",
			region: "us-east-1",
			service: "s3",
			accessKeyId: "AKIAIOSFODNN7EXAMPLE",
			secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
		});
		expect(signed).toBe(
			"AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
		);
	});

	it("encodes keys per segment and hashes the empty payload", async () => {
		expect(encodeKey("psizone/client file/a+b(1)")).toBe("psizone/client%20file/a%2Bb%281%29");
		expect(await sha256("")).toBe(
			"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
		);
	});
});

describe("the S3 environment", () => {
	const ok = {
		S3_ENDPOINT: "https://s3.example.test/",
		S3_BUCKET: "clinic",
		S3_ACCESS_KEY_ID: "id",
		S3_SECRET_ACCESS_KEY: "secret",
	};

	it("parses, defaults the region, and trims the endpoint", () => {
		const read = readStorageEnv(ok);
		expect(read).toMatchObject({
			ok: true,
			config: { endpoint: "https://s3.example.test", region: "us-east-1" },
		});
	});

	it("names the variables that are missing or wrong, never their values", () => {
		const read = readStorageEnv({ ...ok, S3_ENDPOINT: "not a url", S3_BUCKET: undefined });
		expect(read).toEqual({ ok: false, invalid: ["S3_ENDPOINT", "S3_BUCKET"] });
	});
});

async function contract(make: () => ObjectStorage): Promise<void> {
	const store = make();
	expect(await store.get("a/b")).toBeUndefined();
	await store.put("a/b", BYTES, "application/octet-stream");
	expect([...((await store.get("a/b")) ?? [])]).toEqual([...BYTES]);
	await store.put("a/b", new Uint8Array([9]), "application/octet-stream");
	expect([...((await store.get("a/b")) ?? [])]).toEqual([9]);
	await store.delete("a/b");
	expect(await store.get("a/b")).toBeUndefined();
	await store.delete("a/b");
}

describe("object storage", () => {
	it("the in-memory store honours the contract", async () => {
		await contract(() => new MemoryStorage());
	});

	describe("S3 over HTTP", () => {
		const objects = new Map<string, Buffer>();
		const seen: Array<{ method: string; auth: string; hash: string }> = [];
		let url = "";
		const server = createServer((req: IncomingMessage, res) => {
			const chunks: Buffer[] = [];
			req.on("data", (c: Buffer) => chunks.push(c));
			req.on("end", () => {
				seen.push({
					method: req.method ?? "",
					auth: String(req.headers.authorization),
					hash: String(req.headers["x-amz-content-sha256"]),
				});
				const key = req.url ?? "";
				if (req.headers.authorization === undefined) return void res.writeHead(403).end();
				if (key.includes("/failing/")) return void res.writeHead(500).end();
				if (req.method === "PUT") objects.set(key, Buffer.concat(chunks));
				if (req.method === "DELETE") objects.delete(key);
				if (req.method === "GET") {
					const found = objects.get(key);
					if (found === undefined) return void res.writeHead(404).end();
					return void res.writeHead(200).end(found);
				}
				res.writeHead(200).end();
			});
		});

		beforeAll(async () => {
			await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
			const address = server.address();
			url =
				typeof address === "object" && address !== null ? `http://127.0.0.1:${address.port}` : "";
		});
		afterAll(() => void server.close());

		const make = () =>
			createS3Storage({
				endpoint: url,
				region: "us-east-1",
				bucket: "clinic",
				accessKeyId: "id",
				secretAccessKey: "secret",
			});

		it("honours the same contract, signing every request with the payload's hash", async () => {
			await contract(make);
			expect(seen.every((r) => r.auth.startsWith("AWS4-HMAC-SHA256 Credential=id/"))).toBe(true);
			const put = seen.find((r) => r.method === "PUT");
			expect(put?.hash).toBe(await sha256(BYTES));
		});

		it("a failing store throws a StorageError that names the operation and status only", async () => {
			const store = make();
			const error = await store.put("failing/secret-name", BYTES, "x").catch((e: unknown) => e);
			expect(error).toBeInstanceOf(StorageError);
			expect(String(error)).toContain("storage put: HTTP 500");
			expect(String(error)).not.toContain("secret-name");
		});

		it("an unreachable store is reported as such", async () => {
			const store = createS3Storage({
				endpoint: "http://127.0.0.1:1",
				region: "r",
				bucket: "b",
				accessKeyId: "i",
				secretAccessKey: "s",
				timeoutMs: 500,
			});
			await expect(store.get("k")).rejects.toThrow("storage get: unreachable or too slow");
		});
	});
});
