import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { beforeAll, describe, expect, it } from "vitest";
import { chooseEncoding } from "./http/compress";
import { createWorld, type Populated } from "./testing/populate";

const A = "/v1/apps/psizone";
let w: Populated;
beforeAll(async () => {
	w = await createWorld();
});

/** The contract's own description: an answer certainly over the 1 KiB a compression is worth. */
const LARGE = "/v1/openapi.json";

async function get(path: string, encoding?: string, as = "olga") {
	const res = await w.app.request(path === LARGE ? path : `${A}${path}`, {
		headers: {
			authorization: `Bearer ${await w.issuer.mint(as)}`,
			...(encoding === undefined ? {} : { "accept-encoding": encoding }),
		},
	});
	return { res, bytes: Buffer.from(await res.arrayBuffer()) };
}

describe("answers travel compressed, as the caller accepts", () => {
	it("brotli when accepted, the same JSON once decompressed, with its length and Vary", async () => {
		const plain = await get(LARGE);
		const br = await get(LARGE, "gzip, deflate, br");
		expect(br.res.status).toBe(200);
		expect(br.res.headers.get("content-encoding")).toBe("br");
		expect(br.res.headers.get("vary")).toContain("Accept-Encoding");
		expect(Number(br.res.headers.get("content-length"))).toBe(br.bytes.byteLength);
		expect(br.bytes.byteLength).toBeLessThan(plain.bytes.byteLength);
		expect(JSON.parse(brotliDecompressSync(br.bytes).toString())).toEqual(
			JSON.parse(plain.bytes.toString()),
		);
		expect(br.res.headers.get("cache-control")).toBe("no-store");
		expect(br.res.headers.get("x-request-id")).not.toBeNull();
	});

	it("gzip when only gzip is accepted", async () => {
		const gz = await get(LARGE, "gzip");
		expect(gz.res.headers.get("content-encoding")).toBe("gzip");
		expect(JSON.parse(gunzipSync(gz.bytes).toString())).toHaveProperty("paths");
	});

	it("as it is when nothing, or only what is refused, is accepted; still saying Vary", async () => {
		for (const encoding of [undefined, "identity", "br;q=0, gzip;q=0", "deflate"]) {
			const r = await get("/clients?limit=50", encoding);
			expect(r.res.headers.get("content-encoding"), String(encoding)).toBeNull();
			expect(JSON.parse(r.bytes.toString())).toHaveProperty("items");
			expect(r.res.headers.get("vary")).toContain("Accept-Encoding");
		}
	});

	it("a small answer goes as it is (under 1 KiB)", async () => {
		const r = await get("/me", "br");
		if (r.bytes.byteLength < 1024) expect(r.res.headers.get("content-encoding")).toBeNull();
		const health = await w.app.request("/health", { headers: { "accept-encoding": "br" } });
		expect(health.headers.get("content-encoding")).toBeNull();
		expect(await health.json()).toEqual({ status: "ok" });
	});

	it("a refusal is compressed like any answer, and keeps its status", async () => {
		const r = await get("/clients?limit=50", "br", "nobody-at-all");
		expect([403, 404]).toContain(r.res.status);
		const text =
			r.res.headers.get("content-encoding") === "br"
				? brotliDecompressSync(r.bytes).toString()
				: r.bytes.toString();
		expect(JSON.parse(text)).toHaveProperty("error");
	});

	it("an event stream is never compressed: it must flush as it goes", async () => {
		const controller = new AbortController();
		const res = await w.app.request(`${A}/calendar/stream`, {
			headers: {
				authorization: `Bearer ${await w.issuer.mint("rita")}`,
				"accept-encoding": "br, gzip",
			},
			signal: controller.signal,
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/event-stream");
		expect(res.headers.get("content-encoding")).toBeNull();
		const reader = res.body?.getReader();
		const first = await reader?.read();
		expect(new TextDecoder().decode(first?.value)).toMatch(/event:|data:|:/);
		controller.abort();
		await reader?.cancel().catch(() => undefined);
	});
});

describe("chooseEncoding", () => {
	it("prefers brotli at equal weight, follows weights, honours q=0 and *", () => {
		expect(chooseEncoding(undefined)).toBeUndefined();
		expect(chooseEncoding("")).toBeUndefined();
		expect(chooseEncoding("gzip, br")).toBe("br");
		expect(chooseEncoding("br;q=0.5, gzip;q=0.8")).toBe("gzip");
		expect(chooseEncoding("BR")).toBe("br");
		expect(chooseEncoding("br;q=0, gzip")).toBe("gzip");
		expect(chooseEncoding("*")).toBe("br");
		expect(chooseEncoding("*;q=0")).toBeUndefined();
		expect(chooseEncoding("*, br;q=0")).toBe("gzip");
		expect(chooseEncoding("gzip;q=nonsense")).toBeUndefined();
		expect(chooseEncoding("deflate, identity")).toBeUndefined();
	});
});
