import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CounterBatch } from "@psi/cms-client";
import { createGuide } from "@psi/guide";
import { createKnowledge, createLexicalEmbedder, type KnowledgeStore } from "@psi/knowledge";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { countingScope, createGuideCountReporter, mayCountRequest } from "./guide-counts";
import { countingGuide } from "./guide-port";

let dir: string;
let kb: KnowledgeStore;
beforeEach(() => {
	vi.stubEnv("OPENROUTER_API_KEY", "");
	vi.stubEnv("CHROMA_URL", "");
	dir = mkdtempSync(join(tmpdir(), "psi-counts-"));
	kb = createKnowledge({ url: `file:${join(dir, "kb.db")}`, embedder: createLexicalEmbedder() });
});
afterEach(async () => {
	vi.unstubAllEnvs();
	await kb.close();
	rmSync(dir, { recursive: true, force: true });
});

const BROWSER = "Mozilla/5.0 (X11; Linux x86_64) Chrome/140";

describe("the guide's daily totals for the CMS", () => {
	it("count a visitor's question, not DNT, GPC, a crawler or a prefetch", () => {
		const h = (o: Record<string, string>) => new Headers({ "user-agent": BROWSER, ...o });
		expect(mayCountRequest(h({}))).toBe(true);
		expect(mayCountRequest(h({ dnt: "1" }))).toBe(false);
		expect(mayCountRequest(h({ "sec-gpc": "1" }))).toBe(false);
		expect(mayCountRequest(h({ "user-agent": "Googlebot/2.1" }))).toBe(false);
		expect(mayCountRequest(h({ "sec-purpose": "prefetch" }))).toBe(false);
	});

	it("go to the CMS's ingest as counters, summed, and survive a failed flush", async () => {
		const sent: unknown[] = [];
		let up = false;
		const reporter = createGuideCountReporter({
			brand: "eqsync",
			cmsUrl: "http://cms.test",
			token: "t".repeat(40),
			now: () => Date.UTC(2026, 10, 12, 10),
			fetch: async (_url, init) => {
				if (!up) return new Response(null, { status: 503 });
				expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${"t".repeat(40)}`);
				sent.push(JSON.parse(String(init?.body)));
				return Response.json({ stored: 1 });
			},
		});
		reporter.count("guide_asked", "ro");
		reporter.count("guide_asked", "ro");
		await reporter.flush();
		reporter.count("guide_unanswered", "ro");
		up = true;
		await reporter.flush();
		const batch = CounterBatch.parse(sent[0]);
		expect(batch.counters).toEqual(
			expect.arrayContaining([
				{
					day: "2026-11-12",
					brand: "eqsync",
					slug: "",
					locale: "ro",
					topic: null,
					metric: "guide_asked",
					count: 2,
				},
				{
					day: "2026-11-12",
					brand: "eqsync",
					slug: "",
					locale: "ro",
					topic: null,
					metric: "guide_unanswered",
					count: 1,
				},
			]),
		);
		await reporter.flush();
		expect(sent).toHaveLength(1);
	});

	it("are counted per request through the site's counting scope", async () => {
		const counted: string[] = [];
		const guide = countingGuide(createGuide({ brand: "eqsync", knowledge: kb }), {
			reporter: {
				count: (metric, locale) => counted.push(`${metric}:${locale}`),
				flush: async () => {},
			},
		});
		const app = new Hono();
		app.use("*", countingScope());
		app.post("/ask", async (c) => {
			for await (const _ of guide.ask({ question: "Ce este EQ-SYNC?", locale: "ro" })) {
				// A visitor's answer, consumed.
			}
			return c.body(null, 204);
		});
		await app.request("/ask", { method: "POST", headers: { "user-agent": BROWSER } });
		await app.request("/ask", { method: "POST", headers: { "user-agent": BROWSER, dnt: "1" } });
		expect(counted.filter((c) => c.startsWith("guide_asked"))).toEqual(["guide_asked:ro"]);
		// Outside a request (a script, the control plane's own call): nothing.
		for await (const _ of guide.ask({ question: "Ce este EQ-SYNC?", locale: "ro" })) {
			// consumed
		}
		expect(counted.filter((c) => c.startsWith("guide_asked"))).toHaveLength(1);
	});
});
