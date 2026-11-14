import { afterEach, describe, expect, it } from "vitest";
import { createEngine } from "../engine";
import {
	collect,
	FakeKnowledge,
	type FakeOpenRouter,
	type ScreenScript,
	shape,
	startFakeOpenRouter,
} from "../testing";
import { FakeVisitorStore, FOUND, GOVERNED } from "./visitor-harness";

/**
 * At the strict screening level the guardrails (injection and moderation) are model calls of the turn: on a site the
 * organisation governs, what they used reaches its meters with the answer's, and on a turn they refuse it is all the
 * turn used.
 */
let server: FakeOpenRouter | undefined;
afterEach(async () => {
	await server?.close();
	server = undefined;
});

const ANSWER = {
	kind: "text",
	chunks: ["Bikes are rented by the hour [1]."],
	usage: { prompt: 900, completion: 100, cost: 0.00003 },
} as const;

async function strictTurn(store: FakeVisitorStore | undefined, screen: ScreenScript) {
	server = await startFakeOpenRouter([ANSWER], screen);
	const engine = createEngine({
		profiles: [GOVERNED],
		knowledge: new FakeKnowledge([FOUND]),
		model: { id: "acme/small-model", apiKey: "test-key", baseURL: server.baseURL },
		timeouts: { screeningMs: 2_000 },
		settings: async () => ({ screeningLevel: "strict" }),
		...(store === undefined ? {} : { visitorAssistant: store }),
	});
	return collect(
		engine.guide("harbour-bikes").ask({ question: "How do I rent a bike?", locale: "en" }),
	);
}

describe("the strict level's guardrails reach the organisation's meters", () => {
	it("both guardrails' tokens and cost are added to the answer's, as one message", async () => {
		const store = new FakeVisitorStore();
		await strictTurn(store, {
			injection: { kind: "clean", usage: { prompt: 200, completion: 20, cost: 0.000005 } },
			moderation: { kind: "clean", usage: { prompt: 150, completion: 10, cost: 0.000004 } },
		});
		expect(server?.screenings).toHaveLength(2);
		expect(store.records).toHaveLength(1);
		const used = store.records[0]?.usage;
		expect(used).toMatchObject({ messages: 1, limitHits: 0 });
		// The answer's 100 output tokens and 30 micro-dollars, plus the guardrails' 30 and 9.
		expect(used?.outputTokens).toBe(130);
		expect(used?.costMicroUsd).toBe(39);
		expect(used?.inputTokens).toBeGreaterThanOrEqual(900 + 350);
	});

	it("a question the guardrails refuse: what they used is the turn's use, no answer call counted", async () => {
		const store = new FakeVisitorStore();
		const events = await strictTurn(store, {
			injection: { kind: "flag", usage: { prompt: 200, completion: 20, cost: 0.000005 } },
			moderation: { kind: "clean", usage: { prompt: 150, completion: 10, cost: 0.000004 } },
		});
		expect(shape(events)).toContain("refusal:injection");
		expect(server?.requests).toHaveLength(0);
		expect(store.records).toHaveLength(1);
		expect(store.records[0]?.usage).toMatchObject({
			messages: 1,
			inputTokens: 350,
			outputTokens: 30,
			costMicroUsd: 9,
		});
	});

	it("on a site no organisation governs nothing is metered, and the guardrails still run", async () => {
		const events = await strictTurn(undefined, {});
		expect(server?.screenings).toHaveLength(2);
		expect(shape(events)).toContain("done");
	});
});
