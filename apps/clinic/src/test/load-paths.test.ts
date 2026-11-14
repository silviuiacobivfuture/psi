import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLIENT_PAGE_SIZE } from "../port/port";
import { type Console, MEMBER, startConsole } from "./harness";

/**
 * What keeps the console fast as the clinic grows: the client list is a page with a "show more" that appends the next
 * page into the open screen, the stylesheet and Datastar are linked by content hash and cached a year, and what travels
 * is compressed (event streams excepted, so they flush as they go).
 */
let member: Console;
const GZIP = { "accept-encoding": "gzip" };

beforeAll(async () => {
	member = await startConsole(MEMBER);
	await member.signIn();
	// More than a page, whatever the synthetic clinic starts with.
	for (let i = 0; i < CLIENT_PAGE_SIZE + 7; i++)
		await member.port.createClient("psizone", {
			name: `Pagina Client ${String(i).padStart(3, "0")}`,
			phone: null,
			guardian: null,
		});
});
afterAll(() => member.close());

const rowsIn = (html: string): number => html.split('class="client-row"').length - 1;

describe("the client list, a page at a time", () => {
	it("shows one page and a button for the next", async () => {
		const html = await (await member.get("/clients")).text();
		expect(rowsIn(html)).toBe(CLIENT_PAGE_SIZE);
		expect(html).toContain('id="client-more"');
		expect(html).toMatch(/\/clients\/more\?filter=current&(amp;)?cursor=50&(amp;)?shown=50/);
	});

	it("the next page is appended to the open list, and the button goes with the last page", async () => {
		const total = (await member.port.clients("psizone", "current", "")).length;
		const res = await member.get("/clients/more?filter=current&cursor=50&shown=50", {
			headers: { "datastar-request": "true" },
		});
		expect(res.headers.get("content-type")).toContain("text/event-stream");
		const body = await res.text();
		expect(body).toContain("selector #client-list");
		expect(body).toContain("mode append");
		expect(rowsIn(body)).toBe(total - CLIENT_PAGE_SIZE);
		// The last page: the "show more" is patched to nothing, the count says how many there are.
		expect(body).toContain('id="client-more"');
		expect(body).not.toContain("/clients/more?");
		expect(body).toContain(`${total}`);
	});

	it("a search is paged too, and a page that holds everything has no button", async () => {
		const html = await (await member.get("/clients?q=Pagina%20Client%20001")).text();
		expect(rowsIn(html)).toBe(1);
		expect(html).not.toContain("/clients/more?");
	});
});

describe("assets and transport", () => {
	it("a page links the stylesheet and Datastar by content hash", async () => {
		const html = await (await member.get("/calendar")).text();
		expect(html).toMatch(/href="\/assets\/app\.[0-9a-f]{12}\.css"/);
		expect(html).toMatch(/src="\/assets\/datastar\.[0-9a-f]{12}\.js"/);
	});

	it("a hashed file is cached a year, immutable; a stale hash and the plain name only briefly", async () => {
		const html = await (await member.get("/calendar")).text();
		const css = /href="(\/assets\/app\.[0-9a-f]{12}\.css)"/.exec(html)?.[1] ?? "";
		const hashed = await member.raw(css);
		expect(hashed.status).toBe(200);
		expect(hashed.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
		expect(hashed.headers.get("content-type")).toContain("text/css");
		const stale = await member.raw("/assets/app.000000000000.css");
		expect(stale.status).toBe(200);
		expect(stale.headers.get("cache-control")).toBe("public, max-age=300, must-revalidate");
		expect((await member.raw("/assets/app.css")).headers.get("cache-control")).toBe(
			"public, max-age=300, must-revalidate",
		);
		// A hashed name of no asset is not served (it goes on to the signed-in pages, which send it to sign in).
		expect((await member.raw("/assets/nope.000000000000.js")).status).not.toBe(200);
	});

	it("an unhashed asset carries an ETag, and an unchanged one asked again is a 304 with no body", async () => {
		const html = await (await member.get("/calendar")).text();
		const hash = /href="\/assets\/app\.([0-9a-f]{12})\.css"/.exec(html)?.[1] ?? "";
		const plain = await member.raw("/assets/app.css");
		expect(plain.headers.get("etag")).toBe(`"${hash}"`);
		const again = await member.raw("/assets/app.css", {
			headers: { "if-none-match": `"${hash}"` },
		});
		expect(again.status).toBe(304);
		expect(await again.text()).toBe("");
		expect(again.headers.get("cache-control")).toBe("public, max-age=300, must-revalidate");
		const changed = await member.raw("/assets/app.css", {
			headers: { "if-none-match": '"000000000000"' },
		});
		expect(changed.status).toBe(200);
		expect((await changed.text()).length).toBeGreaterThan(0);
		const icon = await member.raw("/favicon.svg");
		const tag = icon.headers.get("etag") ?? "";
		expect(tag).toMatch(/^"[^"]+"$/);
		expect((await member.raw("/favicon.svg", { headers: { "if-none-match": tag } })).status).toBe(
			304,
		);
	});

	it("compresses what is asked compressed, and never an event stream", async () => {
		const css = await member.raw("/assets/app.css", { headers: GZIP });
		expect(css.headers.get("content-encoding")).toBe("gzip");
		expect((await member.raw("/assets/app.css")).headers.get("content-encoding")).toBeNull();
		const stream = await member.get("/clients/more?filter=current&cursor=50&shown=50", {
			headers: { ...GZIP, "datastar-request": "true" },
		});
		expect(stream.headers.get("content-type")).toContain("text/event-stream");
		expect(stream.headers.get("content-encoding")).toBeNull();
	});

	it("personal pages are never cached", async () => {
		expect((await member.get("/clients")).headers.get("cache-control")).toBe("private, no-store");
	});
});
