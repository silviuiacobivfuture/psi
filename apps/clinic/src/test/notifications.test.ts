import { createHmac } from "node:crypto";
import { memoryPushStore } from "@psi/pwa";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mountNovuPush, NOVU_PUSH_PATH } from "../novu-push";
import { type LiveConsole, serveConsole } from "./harness";

let c: LiveConsole;
beforeAll(async () => {
	c = await serveConsole();
});
afterAll(async () => {
	await c.close();
});

const same = (extra: Record<string, string> = {}): Record<string, string> => ({
	origin: c.url,
	"sec-fetch-site": "same-origin",
	...extra,
});
const get = (path: string, cookie = "") =>
	fetch(`${c.url}${path}`, { headers: cookie === "" ? {} : { cookie }, redirect: "manual" });
const post = (path: string, cookie = "") =>
	fetch(`${c.url}${path}`, {
		method: "POST",
		headers: same(cookie === "" ? {} : { cookie }),
		redirect: "manual",
	});

describe("the bell", () => {
	it("is in every page's top bar with the unread count", async () => {
		const html = await (await get("/calendar")).text();
		expect(html).toContain('id="psi-inbox"');
		expect(html).toContain("psi-inbox__bell");
	});
	it("lists the person's notifications, newest first, with links that stay in the console", async () => {
		const body = await (await get("/inbox/panel")).text();
		expect(body).toContain("datastar-patch-elements");
		expect(body).toContain("O cerere nouă a ajuns în consolă");
		expect(body).toContain('href="/requests"');
	});
	it("marks one as read and the badge follows, then all", async () => {
		const unread = async (): Promise<number> => {
			const body = await (await get("/inbox/panel")).text();
			const badge = /id="psi-inbox-badge"[^>]*>(\d*)</.exec(body)?.[1] ?? "";
			return badge === "" ? 0 : Number(badge);
		};
		const before = await unread();
		expect(before).toBe(2);
		expect((await post("/inbox/read?id=n1")).status).toBe(200);
		expect(await unread()).toBe(before - 1);
		expect((await post("/inbox/read-all")).status).toBe(200);
		expect(await unread()).toBe(0);
	});
	it("refuses a write from another site, and changes nothing", async () => {
		const r = await fetch(`${c.url}/inbox/read-all`, {
			method: "POST",
			headers: { origin: "http://evil.test", "sec-fetch-site": "cross-site" },
		});
		expect(r.status).toBe(403);
	});
	it("while viewing as someone else, marking read is refused", async () => {
		const start = await fetch(`${c.url}/view-as`, {
			method: "POST",
			headers: same({ "content-type": "application/x-www-form-urlencoded" }),
			body: new URLSearchParams({ as: "role:reception" }),
			redirect: "manual",
		});
		expect(start.status).toBe(303);
		const cookie = start.headers
			.getSetCookie()
			.map((l) => l.split(";")[0])
			.join("; ");
		const r = await post("/inbox/read-all", cookie);
		expect(r.status).toBe(403);
	});
});

describe("Novu's push webhook", () => {
	const secret = "s".repeat(24);
	const hono = new Hono();
	mountNovuPush(
		hono,
		{ store: async () => memoryPushStore(), transport: () => null },
		{
			apiUrl: "http://novu.test",
			applicationId: "a",
			secretKey: "k".repeat(12),
			pushSecret: secret,
		},
	);
	const body = JSON.stringify({
		target: ["dev1"],
		payload: { meta: { event: "request.new", audience: "reception" } },
	});
	const sign = (text: string): string => createHmac("sha256", secret).update(text).digest("hex");
	it("refuses an unsigned or wrongly signed call", async () => {
		expect((await hono.request(NOVU_PUSH_PATH, { method: "POST", body })).status).toBe(401);
		expect(
			(
				await hono.request(NOVU_PUSH_PATH, {
					method: "POST",
					body,
					headers: { "x-novu-signature": sign("other") },
				})
			).status,
		).toBe(401);
	});
	it("a signed call with push off answers 503, not a crash", async () => {
		const r = await hono.request(NOVU_PUSH_PATH, {
			method: "POST",
			body,
			headers: { "x-novu-signature": sign(body) },
		});
		expect(r.status).toBe(503);
	});
	it("is not mounted without a push secret", async () => {
		const bare = new Hono();
		mountNovuPush(bare, { store: async () => memoryPushStore(), transport: () => null }, null);
		expect((await bare.request(NOVU_PUSH_PATH, { method: "POST", body })).status).toBe(404);
	});
});
