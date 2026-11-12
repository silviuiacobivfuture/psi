import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Counter, CounterBatch } from "@psi/cms-client";
import { describe, expect, it } from "vitest";
import { createCollector } from "./collector";
import { mayCount, optedOut } from "./privacy";
import { type CounterSink, cmsSink, fileSink } from "./sinks";

const UA = "Mozilla/5.0 (X11; Linux x86_64) Chrome/140";
const h = (o: Record<string, string>) => new Headers({ "user-agent": UA, ...o });
const view = {
	brand: "psizone",
	slug: "semne-autism",
	locale: "ro",
	topic: "autism",
	metric: "view",
} as const;

describe("who may be counted", () => {
	it("counts an ordinary reader", () => {
		expect(mayCount(h({}))).toBe(true);
	});
	it.each([
		["Do-Not-Track", { dnt: "1" }],
		["Global Privacy Control", { "sec-gpc": "1" }],
	])("never counts a visitor with %s", (_n, headers) => {
		expect(optedOut(h(headers))).toBe(true);
		expect(mayCount(h(headers))).toBe(false);
	});
	it.each([
		["a crawler", { "user-agent": "Googlebot/2.1" }],
		["a link preview", { "user-agent": "facebookexternalhit/1.1" }],
		["a prefetch", { "sec-purpose": "prefetch" }],
		["no browser at all", { "user-agent": "" }],
	])("does not count %s", (_n, headers) => {
		expect(mayCount(h(headers))).toBe(false);
	});
});

function memorySink(): CounterSink & { batches: Counter[][] } {
	const batches: Counter[][] = [];
	return { kind: "file", batches, write: async (c) => void batches.push([...c]) };
}

describe("the collector keeps no personal data", () => {
	it("counts a reader once per article and day, and flushes counters only", async () => {
		const sink = memorySink();
		const c = createCollector({ sink, now: () => new Date("2026-11-12T10:00:00Z") });
		c.hit(view, "203.0.113.7|Mozilla");
		c.hit(view, "203.0.113.7|Mozilla");
		c.hit(view, "198.51.100.2|Mozilla");
		await c.flush();
		expect(sink.batches).toEqual([[{ ...view, day: "2026-11-12", count: 2 }]]);
		const wire = JSON.stringify(sink.batches);
		expect(wire).not.toContain("203.0.113.7");
		expect(wire).not.toContain("Mozilla");
		for (const counter of sink.batches.flat()) expect(Counter.strict().parse(counter)).toBeTruthy();
	});
	it("forgets yesterday's readers: the same reader counts again the next day", async () => {
		let t = new Date("2026-11-12T23:59:00Z");
		const sink = memorySink();
		const c = createCollector({ sink, now: () => t });
		c.hit(view, "a");
		t = new Date("2026-11-13T00:01:00Z");
		c.hit(view, "a");
		await c.flush();
		expect(sink.batches[0]?.map((x) => [x.day, x.count])).toEqual([
			["2026-11-12", 1],
			["2026-11-13", 1],
		]);
	});
	it("keeps the counters for the next flush when the store is down", async () => {
		let fail = true;
		const seen: Counter[][] = [];
		const sink: CounterSink = {
			kind: "cms",
			write: async (c) => {
				if (fail) throw new Error("down");
				seen.push([...c]);
			},
		};
		const c = createCollector({ sink, now: () => new Date("2026-11-12T10:00:00Z") });
		c.count({ ...view, brand: "blog", slug: "", topic: null, metric: "guide_asked" });
		await c.flush();
		fail = false;
		await c.flush();
		expect(seen[0]?.[0]?.count).toBe(1);
	});
});

describe("sinks", () => {
	it("posts the strict batch to the CMS with the collector's key", async () => {
		const sent: unknown[] = [];
		const fake: typeof fetch = async (url, init) => {
			expect(String(url)).toBe("http://cms.test/api/analytics/ingest");
			expect(new Headers(init?.headers).get("authorization")).toBe("Bearer k");
			sent.push(CounterBatch.parse(JSON.parse(String(init?.body))));
			return new Response(null, { status: 200 });
		};
		await cmsSink("http://cms.test", "k", fake).write([{ ...view, day: "2026-11-12", count: 3 }]);
		expect(sent).toHaveLength(1);
	});
	it("sums into the local dev store", async () => {
		const file = join(await mkdtemp(join(tmpdir(), "psi-analytics-")), "a.json");
		const s = fileSink(file);
		await s.write([{ ...view, day: "2026-11-12", count: 2 }]);
		await s.write([{ ...view, day: "2026-11-12", count: 1 }]);
		const stored = CounterBatch.parse(JSON.parse(await readFile(file, "utf8")));
		expect(stored.counters).toEqual([{ ...view, day: "2026-11-12", count: 3 }]);
	});
});
