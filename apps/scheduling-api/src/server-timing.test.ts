import { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { createLiveAuthz } from "./authz/live";
import { createRpc } from "./store/convex/rpc";
import { createWorld, type Populated } from "./testing/populate";
import { serverTiming } from "./timing";

const A = "/v1/apps/psizone";
let w: Populated;
beforeAll(async () => {
	w = await createWorld();
});

/** The header's entries by name: duration and description. */
function entries(header: string | null): Map<string, { dur: number; desc: string | undefined }> {
	const out = new Map<string, { dur: number; desc: string | undefined }>();
	for (const part of (header ?? "").split(",")) {
		const [name, ...params] = part.trim().split(";");
		if (name === undefined || name === "") continue;
		const dur = params.find((p) => p.startsWith("dur="))?.slice(4);
		const desc = params.find((p) => p.startsWith("desc="))?.slice(5);
		out.set(name, { dur: Number(dur), desc });
	}
	return out;
}

describe("every answer says where its time went (Server-Timing)", () => {
	it("a person's call: the sign-in check, the handler and the total, each a duration and nothing else", async () => {
		const res = await w.app.request(`${A}/people`, {
			headers: { authorization: `Bearer ${await w.issuer.mint("olga")}` },
		});
		expect(res.status).toBe(200);
		const got = entries(res.headers.get("server-timing"));
		expect([...got.keys()]).toEqual(["auth", "handler", "total"]);
		for (const [, e] of got) expect(e.dur).toBeGreaterThanOrEqual(0);
		expect(got.get("auth")?.desc).toMatch(/^"1x [0-9.]+ms"$/);
		// The handler ran inside the whole answer.
		expect(got.get("total")?.dur ?? 0).toBeGreaterThanOrEqual(got.get("handler")?.dur ?? 0);
	});

	it("a call without a credential is refused before any handler: only the total", async () => {
		const res = await w.app.request(`${A}/people`);
		expect(res.status).toBe(401);
		expect([...entries(res.headers.get("server-timing")).keys()]).toEqual(["total"]);
	});

	it("a refused token: the sign-in check is timed, no handler ran", async () => {
		const res = await w.app.request(`${A}/people`, {
			headers: { authorization: "Bearer not.a.token" },
		});
		expect(res.status).toBe(401);
		expect([...entries(res.headers.get("server-timing")).keys()]).toEqual(["auth", "total"]);
	});

	it("an unknown route and the health check carry the total too", async () => {
		for (const path of ["/v1/nowhere", "/health"]) {
			const res = await w.app.request(path);
			expect(entries(res.headers.get("server-timing")).has("total")).toBe(true);
		}
	});

	it("OpenFGA's and Convex's calls are timed under their own names, each call counted, in parallel counted once", async () => {
		const later = (ms: number, body: unknown): Promise<Response> =>
			new Promise((r) => setTimeout(() => r(new Response(JSON.stringify(body))), ms));
		const authz = createLiveAuthz({
			readUrl: "http://fga",
			writeUrl: "http://fga-admin",
			storeId: "S",
			modelId: "M",
			token: "t",
			fetch: () => later(30, { allowed: true }),
		});
		const rpc = createRpc({
			url: "http://convex",
			fetch: () => later(10, { status: "success", value: 1 }),
		});
		const app = new Hono();
		app.use("*", serverTiming());
		app.get("/", async (c) => {
			await Promise.all([
				authz.check("user:a", "member", "sched_app:x"),
				authz.check("user:a", "admin", "sched_app:x"),
			]);
			await rpc.query("apps:get", {}, z.number());
			return c.text("ok");
		});
		const got = entries((await app.request("/")).headers.get("server-timing"));
		expect([...got.keys()]).toEqual(["fga", "convex", "total"]);
		expect(got.get("fga")?.desc).toMatch(/^"2x /);
		expect(got.get("convex")?.desc).toMatch(/^"1x /);
		// Two checks of ~30 ms side by side: waited ~30 ms, not ~60.
		const fga = got.get("fga")?.dur ?? 0;
		expect(fga).toBeGreaterThanOrEqual(25);
		expect(fga).toBeLessThan(55);
	});

	it("outside a request the adapters only run: nothing is kept, nothing throws", async () => {
		const rpc = createRpc({
			url: "http://convex",
			fetch: async () => new Response(JSON.stringify({ status: "success", value: 2 })),
		});
		expect(await rpc.query("apps:get", {}, z.number())).toBe(2);
	});
});
