import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { caching, etagMatches, IMMUTABLE, SHORT, staticCacheControl } from "./caching";

function app(): { app: Hono; renders: () => number } {
	let renders = 0;
	const a = new Hono();
	a.use("*", caching());
	a.get("/", (c) => {
		renders++;
		return c.html(`<p>home ${c.req.query("v") ?? ""}</p>`);
	});
	a.get("/kept", (c) => c.html("<p>kept</p>", 200, { "cache-control": "public, max-age=60" }));
	a.get("/mine", (c) => c.html("<p>mine</p>", 200, { "cache-control": "private, no-store" }));
	a.get("/nostore", (c) => c.html("<p>x</p>", 200, { "cache-control": "no-store" }));
	a.get("/missing", (c) => c.html("<p>missing</p>", 404));
	a.post("/", (c) => c.html("<p>posted</p>"));
	a.get("/text", (c) => c.text("plain"));
	a.get("/tagged", (c) =>
		c.body("css", 200, { etag: '"v1"', "cache-control": SHORT, "content-type": "text/css" }),
	);
	return { app: a, renders: () => renders };
}

describe("caching: pages", () => {
	it("a public page is no-cache with a weak ETag of its bytes", async () => {
		const res = await app().app.request("/");
		expect(res.headers.get("cache-control")).toBe("no-cache");
		expect(res.headers.get("etag")).toMatch(/^W\/"[A-Za-z0-9_-]{22}"$/);
		expect(await res.text()).toBe("<p>home </p>");
	});

	it("the same bytes have the same ETag; different bytes another", async () => {
		const a = app().app;
		const one = (await a.request("/")).headers.get("etag");
		expect((await a.request("/")).headers.get("etag")).toBe(one);
		expect((await a.request("/?v=2")).headers.get("etag")).not.toBe(one);
	});

	it("asked again with its ETag, it is a bodiless 304 that keeps the validator and policy", async () => {
		const { app: a } = app();
		const tag = (await a.request("/")).headers.get("etag") ?? "";
		for (const ifNoneMatch of [tag, tag.replace(/^W\//, ""), `"other", ${tag}`, "*"]) {
			const res = await a.request("/", { headers: { "if-none-match": ifNoneMatch } });
			expect(res.status).toBe(304);
			expect(await res.text()).toBe("");
			expect(res.headers.get("etag")).toBe(tag);
			expect(res.headers.get("cache-control")).toBe("no-cache");
			expect(res.headers.get("content-type")).toBeNull();
		}
		const changed = await a.request("/?v=2", { headers: { "if-none-match": tag } });
		expect(changed.status).toBe(200);
		expect(await changed.text()).toBe("<p>home 2</p>");
	});

	it("a page that set its own cache policy keeps it", async () => {
		const res = await app().app.request("/kept");
		expect(res.headers.get("cache-control")).toBe("public, max-age=60");
		expect(res.headers.get("etag")).not.toBeNull();
	});

	it("a personal page stays private, no-store, without an ETag, and is never a 304", async () => {
		for (const path of ["/mine", "/nostore"]) {
			const res = await app().app.request(path, { headers: { "if-none-match": "*" } });
			expect(res.status).toBe(200);
			expect(res.headers.get("etag")).toBeNull();
			expect(res.headers.get("cache-control")).toMatch(/no-store/);
		}
	});

	it("leaves errors, writes and non-HTML alone", async () => {
		const { app: a } = app();
		for (const res of [
			await a.request("/missing"),
			await a.request("/", { method: "POST" }),
			await a.request("/text"),
		]) {
			expect(res.headers.get("etag")).toBeNull();
			expect(res.headers.get("cache-control")).toBeNull();
		}
	});
});

describe("caching: any validator", () => {
	it("a response that brought its own ETag answers its If-None-Match with a 304", async () => {
		const { app: a } = app();
		const res = await a.request("/tagged", { headers: { "if-none-match": 'W/"v1"' } });
		expect(res.status).toBe(304);
		expect(res.headers.get("cache-control")).toBe(SHORT);
		const stale = await a.request("/tagged", { headers: { "if-none-match": '"v0"' } });
		expect(stale.status).toBe(200);
		expect(await stale.text()).toBe("css");
	});
});

describe("etagMatches", () => {
	it.each([
		['"a"', undefined, false],
		['"a"', '"a"', true],
		['W/"a"', '"a"', true],
		['"a"', 'W/"a"', true],
		['"a"', '"b", "a"', true],
		['"a"', '"ab"', false],
		['"a"', "*", true],
		['"a"', "", false],
	] as const)("%s vs If-None-Match %j → %s", (etag, header, expected) => {
		expect(etagMatches(etag, header)).toBe(expected);
	});
});

describe("staticCacheControl", () => {
	it.each([
		["/assets/images/pz-hero-480.4d58afe377.avif", IMMUTABLE],
		["/assets/pwa/client.2cab910a2f.js", IMMUTABLE],
		["/assets/app.0123456789ab.css", IMMUTABLE],
		["/assets/brand/psizone-emblem-320.webp", SHORT],
		["/images/old-site/team-adrian-turcu.webp", SHORT],
		["/assets/demo-somn.mp3", SHORT],
		["/favicon.svg", SHORT],
		["/assets/images/name.abc.webp", SHORT],
	])("%s → %s", (path, expected) => {
		expect(staticCacheControl(path)).toBe(expected);
	});
});
