import { type RunningApi, startApi } from "@psi/scheduling-api/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LiveSignal } from "../port";
import { createSdkPort } from "./index";

const A = "/v1/apps/psizone";
let api: RunningApi;
beforeAll(async () => {
	api = await startApi();
});
afterAll(async () => {
	await api.close();
});

const FAST = { baseMs: 10, maxMs: 40 };
const owner = (method: string, path: string, body?: unknown) =>
	api.world.call("olga", method, `${A}${path}`, body);

/** Collects signals until `done` says enough or the clock runs out. */
async function collect(
	source: AsyncIterable<LiveSignal>,
	controller: AbortController,
	done: (seen: LiveSignal[]) => boolean,
	ms = 3000,
): Promise<LiveSignal[]> {
	const seen: LiveSignal[] = [];
	const timer = setTimeout(() => controller.abort(), ms);
	try {
		for await (const s of source) {
			seen.push(s);
			if (done(seen)) break;
		}
	} finally {
		clearTimeout(timer);
		controller.abort();
	}
	return seen;
}

describe("live: the service's streams, forwarded", () => {
	it("a new appointment tells the calendar stream", async () => {
		const p = createSdkPort({
			baseUrl: api.url,
			bearer: () => api.tokenFor("olga"),
			backoff: FAST,
		});
		const stop = new AbortController();
		const pending = collect(p.live("psizone", stop.signal), stop, (s) =>
			s.some((x) => x.stream === "calendar"),
		);
		await new Promise((r) => setTimeout(r, 150));
		await owner("POST", "/appointments", {
			practitionerId: api.world.ids.elena,
			clientId: api.world.ids.c2,
			start: Date.UTC(2026, 10, 20, 8),
			end: Date.UTC(2026, 10, 20, 9),
		});
		expect((await pending).some((x) => x.stream === "calendar")).toBe(true);
	});
	it("a web request tells the requests stream and moves the inbox badge", async () => {
		const p = createSdkPort({
			baseUrl: api.url,
			bearer: () => api.tokenFor("rita"),
			backoff: FAST,
		});
		const stop = new AbortController();
		const pending = collect(
			p.live("psizone", stop.signal),
			stop,
			(s) =>
				s.some((x) => x.stream === "requests") &&
				s.some((x) => x.stream === "inbox" && (x.counts?.requests ?? 0) > 0),
		);
		await new Promise((r) => setTimeout(r, 150));
		await api.world.callKey("psizone-web", "POST", `${A}/book/callback-requests`, {
			contact: { name: "Live Caller", phone: "0733 000 444" },
			locale: "ro",
		});
		const seen = await pending;
		expect(seen.some((x) => x.stream === "requests")).toBe(true);
		expect(seen.find((x) => x.stream === "inbox" && (x.counts?.requests ?? 0) > 0)).toBeDefined();
	});
	it("a dropped connection is opened again with backoff, and the feed carries on", async () => {
		let streamAttempts = 0;
		const p = createSdkPort({
			baseUrl: api.url,
			bearer: () => api.tokenFor("olga"),
			backoff: FAST,
			fetch: async (input, init) => {
				if (String(input).includes("/calendar/stream")) {
					streamAttempts += 1;
					if (streamAttempts <= 3) throw new TypeError("connection dropped");
				}
				return fetch(input, init);
			},
		});
		const stop = new AbortController();
		const pending = collect(p.live("psizone", stop.signal), stop, (s) =>
			s.some((x) => x.stream === "calendar"),
		);
		await new Promise((r) => setTimeout(r, 500));
		await owner("POST", "/appointments", {
			practitionerId: api.world.ids.dora,
			clientId: api.world.ids.c1,
			start: Date.UTC(2026, 10, 21, 8),
			end: Date.UTC(2026, 10, 21, 9),
		});
		expect((await pending).some((x) => x.stream === "calendar")).toBe(true);
		expect(streamAttempts).toBeGreaterThanOrEqual(4);
	});
	it("a stream the service closes is opened again", async () => {
		let opened = 0;
		const p = createSdkPort({
			baseUrl: api.url,
			bearer: () => api.tokenFor("olga"),
			backoff: FAST,
			fetch: async (input, init) => {
				const res = await fetch(input, init);
				if (!String(input).includes("/requests/stream") || res.body === null) return res;
				opened += 1;
				if (opened > 1) return res;
				// the first connection ends right after the handshake
				const reader = res.body.getReader();
				const first = await reader.read();
				await reader.cancel();
				return new Response(first.value ?? null, { status: 200, headers: res.headers });
			},
		});
		const stop = new AbortController();
		await collect(p.live("psizone", stop.signal), stop, () => opened >= 2, 800);
		expect(opened).toBeGreaterThanOrEqual(2);
	});
	it("a person who may see neither the calendar nor the requests gets no feed, and the generator ends", async () => {
		const p = createSdkPort({
			baseUrl: api.url,
			bearer: () => api.tokenFor("vera"),
			backoff: FAST,
		});
		const stop = new AbortController();
		const seen = await collect(p.live("psizone", stop.signal), stop, () => false, 2000);
		expect(seen).toEqual([]);
		expect(stop.signal.aborted).toBe(true);
	});
	it("a service that has not built the streams yet (501) ends the feed without a crash", async () => {
		const p = createSdkPort({
			baseUrl: "http://service.test",
			bearer: async () => "t",
			backoff: FAST,
			fetch: async () =>
				new Response(
					JSON.stringify({ error: { code: "not_available_yet", message: "no", requestId: "r" } }),
					{ status: 501 },
				),
		});
		const stop = new AbortController();
		const seen = await collect(p.live("psizone", stop.signal), stop, () => false, 2000);
		expect(seen).toEqual([]);
	});
	it("aborting the signal ends the feed at once", async () => {
		const p = createSdkPort({
			baseUrl: api.url,
			bearer: () => api.tokenFor("olga"),
			backoff: FAST,
		});
		const stop = new AbortController();
		const started = Date.now();
		setTimeout(() => stop.abort(), 100);
		const seen = await collect(p.live("psizone", stop.signal), stop, () => false, 5000);
		expect(Date.now() - started).toBeLessThan(2000);
		expect(Array.isArray(seen)).toBe(true);
	});
});
