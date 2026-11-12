import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createEngine } from "../engine";
import { EngineOptionsSchema } from "../engine-options";
import type { EngineIngest, EngineIngestReport } from "../ingest-workflow";
import {
	collect,
	FakeKnowledge,
	type FakeOpenRouter,
	passage,
	source,
	startFakeOpenRouter,
} from "../testing";
import { BIKES } from "./consumer-profiles";

const FOUND = {
	kind: "passages",
	passages: [
		passage(source("rental", "Renting a bike"), "Bikes are rented by the hour, from 9 to 18."),
	],
} as const;

let fake: FakeOpenRouter | undefined;
beforeEach(() => vi.stubEnv("OPENROUTER_API_KEY", ""));
afterEach(async () => {
	vi.unstubAllEnvs();
	await fake?.close();
	fake = undefined;
});

const Routed = z.object({ provider: z.object({ data_collection: z.string() }) });

describe("OpenRouter data-collection routing", () => {
	for (const policy of [undefined, "deny", "allow"] as const) {
		it(`sends data_collection ${policy ?? "deny (the default)"} on the answer and both guardrails`, async () => {
			const server = await startFakeOpenRouter([
				{ kind: "text", chunks: ["Bikes are rented by the hour [1]."] },
			]);
			fake = server;
			const engine = createEngine({
				profiles: [BIKES],
				knowledge: new FakeKnowledge([FOUND]),
				model: {
					id: "acme/small-model",
					apiKey: "test-key",
					baseURL: server.baseURL,
					...(policy === undefined ? {} : { dataCollection: policy }),
				},
				settings: async () => ({ screeningLevel: "strict" }),
			});
			await collect(
				engine.guide("harbour-bikes").ask({ question: "How do I rent?", locale: "en" }),
			);
			const bodies = [...server.requests, ...server.screenings].map((r) => Routed.parse(r.body));
			expect(server.requests).toHaveLength(1);
			expect(server.screenings).toHaveLength(2);
			for (const body of bodies) expect(body.provider.data_collection).toBe(policy ?? "deny");
		});
	}

	it("refuses an unknown policy at startup", () => {
		const options = {
			profiles: [BIKES],
			knowledge: new FakeKnowledge([FOUND]),
			model: { id: "acme/small-model", dataCollection: "sometimes" },
		};
		expect(EngineOptionsSchema.safeParse(options).success).toBe(false);
		expect(
			EngineOptionsSchema.safeParse({ ...options, model: { id: "acme/small-model" } }).success,
		).toBe(true);
	});
});

/** A consumer's ingest over a plain array: the port's contract, not the engine's code. */
function arrayIngest(): { port: EngineIngest; stored: Array<unknown> } {
	const stored: Array<unknown> = [];
	const Entry = z.object({ id: z.string(), text: z.string() });
	const port: EngineIngest = {
		sets: { starter: () => [{ id: "a", text: "Bikes by the hour." }] },
		async ingest(entries): Promise<EngineIngestReport> {
			const parsed = z.array(Entry).parse(entries);
			stored.push(...parsed);
			return {
				store: "array",
				embedder: "none",
				dimension: null,
				indexed: parsed.map((e) => ({ id: e.id, index: "all", chunks: 1 })),
				skipped: [],
				chunks: parsed.length,
			};
		},
	};
	return { port, stored };
}

const RunSchema = z.object({
	status: z.string(),
	result: z
		.object({
			sets: z.array(z.object({ name: z.string(), entries: z.number() })),
			report: z.object({ indexed: z.array(z.object({ id: z.string() })), chunks: z.number() }),
		})
		.optional(),
});

describe("the ingest-knowledge workflow", () => {
	it("is registered only when an ingest is given", () => {
		const without = createEngine({
			profiles: [BIKES],
			knowledge: new FakeKnowledge([FOUND]),
			model: { id: "acme/small-model" },
		});
		expect(Object.keys(without.mastra.listWorkflows())).toEqual(["groundedAnswer"]);
		const { port } = arrayIngest();
		const withIngest = createEngine({
			profiles: [BIKES],
			knowledge: new FakeKnowledge([FOUND]),
			model: { id: "acme/small-model" },
			ingest: port,
		});
		expect(withIngest.mastra.getWorkflow("ingestKnowledge").id).toBe("ingest-knowledge");
	});

	it("ingests a named set and given entries through the consumer's ingest", async () => {
		const { port, stored } = arrayIngest();
		const { mastra } = createEngine({
			profiles: [BIKES],
			knowledge: new FakeKnowledge([FOUND]),
			model: { id: "acme/small-model" },
			ingest: port,
		});
		const run = await mastra.getWorkflow("ingestKnowledge").createRun();
		const out = RunSchema.parse(
			await run.start({
				inputData: { sets: ["starter"], entries: [{ id: "b", text: "Helmets are free." }] },
			}),
		);
		expect(out.status).toBe("success");
		expect(out.result?.sets).toEqual([{ name: "starter", entries: 1 }]);
		expect(out.result?.report.indexed.map((e) => e.id)).toEqual(["a", "b"]);
		expect(stored).toHaveLength(2);
	});

	it("fails the run for an unknown set or an empty request, ingesting nothing", async () => {
		const { port, stored } = arrayIngest();
		const { mastra } = createEngine({
			profiles: [BIKES],
			knowledge: new FakeKnowledge([FOUND]),
			model: { id: "acme/small-model" },
			ingest: port,
		});
		for (const inputData of [{ sets: ["nope"] }, {}]) {
			const run = await mastra.getWorkflow("ingestKnowledge").createRun();
			expect(RunSchema.parse(await run.start({ inputData })).status).toBe("failed");
		}
		expect(stored).toHaveLength(0);
	});
});
