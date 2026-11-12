import { CounterBatch } from "@psi/cms-client";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
	countingScope,
	createGuideCountReporter,
	currentPath,
	type GuideCountReporter,
	type GuideMetric,
} from "./guide-counts";
import { guideSignal } from "./guide-signal";

const BROWSER = "Mozilla/5.0 (X11; Linux x86_64) Chrome/140";

function setup() {
	const counted: Array<[GuideMetric, "ro" | "en"]> = [];
	const reporter: GuideCountReporter = {
		count: (metric, locale) => void counted.push([metric, locale]),
		flush: async () => undefined,
	};
	const app = new Hono();
	app.use("*", countingScope());
	app.post("/ghid/signal", guideSignal({ reporter, locale: "ro" }));
	app.post("/en/ghid/signal", guideSignal({ reporter, locale: "en" }));
	app.get("/where", (c) => c.text(currentPath()));
	const post = (body: unknown, headers: Record<string, string> = {}, path = "/ghid/signal") =>
		app.request(path, {
			method: "POST",
			headers: { "content-type": "application/json", "user-agent": BROWSER, ...headers },
			body: typeof body === "string" ? body : JSON.stringify(body),
		});
	return { counted, post, app };
}

describe("the compass's invitation counters", () => {
	it("count an opening, a nudge shown and a nudge clicked, each as its own daily counter", async () => {
		const { counted, post } = setup();
		for (const e of ["open", "nudge", "nudge_click"]) {
			expect((await post({ e })).status).toBe(204);
		}
		expect(counted).toEqual([
			["guide_opened", "ro"],
			["guide_nudge_shown", "ro"],
			["guide_nudge_clicked", "ro"],
		]);
	});

	it("count under the locale of the route", async () => {
		const { counted, post } = setup();
		await post({ e: "open" }, {}, "/en/ghid/signal");
		expect(counted).toEqual([["guide_opened", "en"]]);
	});

	for (const [who, headers] of [
		["Do-Not-Track", { dnt: "1" }],
		["Global Privacy Control", { "sec-gpc": "1" }],
		["a crawler", { "user-agent": "Googlebot/2.1" }],
		["a prefetch", { "sec-purpose": "prefetch" }],
		["no user agent", { "user-agent": "" }],
	] as const) {
		it(`answers ${who} and counts nothing`, async () => {
			const { counted, post } = setup();
			expect((await post({ e: "open" }, headers)).status).toBe(204);
			expect(counted).toEqual([]);
		});
	}

	for (const [what, body] of [
		["an unknown step", { e: "question" }],
		["a counter's own name", { e: "guide_opened" }],
		["an extra field (a text, an identifier)", { e: "open", text: "Copilul meu plânge" }],
		["no step", {}],
		["a list", [{ e: "open" }]],
		["text that is not JSON", "open"],
		["null", "null"],
	] as const) {
		it(`refuses ${what}, counting nothing`, async () => {
			const { counted, post } = setup();
			expect((await post(body)).status).toBe(400);
			expect(counted).toEqual([]);
		});
	}

	it("counts nothing, and still answers, when the site has no CMS to count for", async () => {
		const app = new Hono();
		app.use("*", countingScope());
		app.post("/ghid/signal", guideSignal({ reporter: null, locale: "ro" }));
		const res = await app.request("/ghid/signal", {
			method: "POST",
			headers: { "user-agent": BROWSER },
			body: JSON.stringify({ e: "open" }),
		});
		expect(res.status).toBe(204);
	});
});

describe("the path of the request being rendered", () => {
	it("is the request's path inside the scope, and the home outside any", async () => {
		const { app } = setup();
		expect(await (await app.request("/where")).text()).toBe("/where");
		expect(currentPath()).toBe("/");
	});
});

describe("the invitation counters on their way to the CMS", () => {
	it("travel as daily counters the CMS's ingest accepts: a number per day, brand and locale", async () => {
		const sent: unknown[] = [];
		const reporter = createGuideCountReporter({
			brand: "psizone",
			cmsUrl: "https://cms.test",
			token: "t".repeat(32),
			now: () => Date.UTC(2026, 10, 12, 9),
			fetch: async (_url, init) => {
				sent.push(JSON.parse(String(init?.body)));
				return new Response(null, { status: 204 });
			},
		});
		for (const metric of ["guide_opened", "guide_nudge_shown", "guide_nudge_clicked"] as const) {
			reporter.count(metric, "ro");
		}
		reporter.count("guide_opened", "ro");
		await reporter.flush();
		const batch = CounterBatch.parse(sent[0]);
		const byMetric = Object.fromEntries(batch.counters.map((c) => [c.metric, c.count]));
		expect(byMetric).toEqual({ guide_opened: 2, guide_nudge_shown: 1, guide_nudge_clicked: 1 });
		for (const c of batch.counters) {
			expect(c).toMatchObject({ day: "2026-11-12", brand: "psizone", slug: "", locale: "ro" });
		}
	});
});
