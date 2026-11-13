import { describe, expect, it } from "vitest";
import { createLimiter } from "./ports/ratelimit";
import { createWorld } from "./testing/populate";

describe("the token bucket", () => {
	it("lets a burst through, then refuses, then refills with time", () => {
		let now = 0;
		const l = createLimiter({ capacity: 3, refillPerSecond: 1 }, () => now);
		expect([l.take("a"), l.take("a"), l.take("a")].every((r) => r.ok)).toBe(true);
		expect(l.take("a")).toEqual({ ok: false, retryAfterSeconds: 1 });
		now += 1000;
		expect(l.take("a").ok).toBe(true);
		expect(l.take("a").ok).toBe(false);
		now += 60_000;
		expect([l.take("a"), l.take("a"), l.take("a")].every((r) => r.ok)).toBe(true);
		expect(l.take("a").ok).toBe(false);
	});

	it("keeps keys apart and forgets the least recently used when it is full", () => {
		const l = createLimiter({ capacity: 1, refillPerSecond: 0.001 }, () => 0);
		expect(l.take("a").ok).toBe(true);
		expect(l.take("b").ok).toBe(true);
		expect(l.take("a").ok).toBe(false);
		for (let i = 0; i < 20_001; i++) l.take(`k${i}`);
		expect(l.take("a").ok).toBe(true);
	});
});

describe("on the visitor routes", () => {
	const A = "/v1/apps/psizone";
	const limited = async () => {
		const w = await createWorld();
		w.deps.limiter = createLimiter({ capacity: 3, refillPerSecond: 1 }, () => w.clock.now);
		return w;
	};
	const get = (w: Awaited<ReturnType<typeof limited>>, ip: string) =>
		w.callKey("psizone-web", "GET", `${A}/book/services`, undefined, { "x-psi-client-ip": ip });

	it("a visitor who exceeds the rate gets 429 with Retry-After, and nothing is written", async () => {
		const w = await limited();
		for (let i = 0; i < 3; i++) expect((await get(w, "203.0.113.7")).status).toBe(200);
		const before = await w.fingerprint();
		const r = await get(w, "203.0.113.7");
		expect(r.status).toBe(429);
		expect(r.json.error).toMatchObject({ code: "rate_limited" });
		expect(r.headers.get("retry-after")).toBe("1");
		const post = await w.callKey(
			"psizone-web",
			"POST",
			`${A}/book/callback-requests`,
			{ contact: { name: "x", phone: "1234567" }, locale: "ro" },
			{ "x-psi-client-ip": "203.0.113.7" },
		);
		expect(post.status).toBe(429);
		expect(await w.fingerprint()).toBe(before);
	});

	it("another visitor of the same site, another site, and a later second are not affected", async () => {
		const w = await limited();
		for (let i = 0; i < 4; i++) await get(w, "203.0.113.7");
		expect((await get(w, "198.51.100.9")).status).toBe(200);
		expect(
			(
				await w.callKey("hemisync-web", "GET", "/v1/apps/hemisync/book/services", undefined, {
					"x-psi-client-ip": "203.0.113.7",
				})
			).status,
		).toBe(200);
		w.clock.now += 1000;
		expect((await get(w, "203.0.113.7")).status).toBe(200);
	});

	it("a signed-in visitor is limited by subject, whatever address header they send", async () => {
		const w = await limited();
		for (let i = 0; i < 3; i++)
			await w.call("v1", "GET", `${A}/me/appointments`, undefined, {
				headers: { "x-psi-client-ip": `10.0.0.${i}` },
			});
		expect(
			(
				await w.call("v1", "GET", `${A}/me/appointments`, undefined, {
					headers: { "x-psi-client-ip": "10.0.0.99" },
				})
			).status,
		).toBe(429);
		expect((await w.call("v2", "GET", `${A}/me/appointments`)).status).toBe(200);
	});

	it("a refused credential is refused before the bucket is touched, and team routes are not limited", async () => {
		const w = await limited();
		for (let i = 0; i < 10; i++)
			expect((await w.call(null, "GET", `${A}/book/services`)).status).toBe(401);
		for (let i = 0; i < 10; i++)
			expect((await w.call("olga", "GET", `${A}/clients`)).status).toBe(200);
	});
});
