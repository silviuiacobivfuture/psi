import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogItem, EngineCatalog } from "../catalog";
import type { EngineKnowledge, KnowledgeQuery, Passage } from "../contract";
import { createEngine } from "../engine";
import { MAX_TOOL_CALLS } from "../grounding/agent-tools";
import {
	answerText,
	collect,
	type FakeOpenRouter,
	type FakeReply,
	passage,
	shape,
	source,
	startFakeOpenRouter,
	systemText,
} from "../testing";
import { BIKES } from "./consumer-profiles";

const RENTAL = source("rental", "Renting a bike");
const HELMETS = source("helmets", "Helmets");
const RENTAL_TEXT = "Bikes are rented by the hour at the harbour desk, from 9 to 18.";
const HELMET_TEXT = "Helmets are free with every rental.";

/** A knowledge with a catalog whose entries can change, as an ingest changes them. */
class CatalogKnowledge implements EngineKnowledge {
	readonly queries: Array<KnowledgeQuery> = [];
	entries: Array<{ item: CatalogItem; passages: ReadonlyArray<Passage> }> = [
		{
			item: {
				id: "rental",
				title: "Renting a bike",
				url: "/rental",
				kind: "operational",
				topic: "rental",
				chunks: 1,
			},
			passages: [passage(RENTAL, RENTAL_TEXT)],
		},
	];
	readonly catalog: EngineCatalog = {
		items: () => this.entries.map((e) => e.item),
		entry: (_scope, _locale, id) => this.entries.find((e) => e.item.id === id)?.passages ?? [],
		lookups: [
			{
				id: "rentalDesk",
				description: "The rental desk's hours.",
				select: (items) => items.filter((i) => i.topic === "rental").map((i) => i.id),
			},
		],
	};

	async search(q: KnowledgeQuery): Promise<ReadonlyArray<Passage>> {
		this.queries.push(q);
		return this.entries.flatMap((e) => e.passages);
	}
}

function descriptionOf(tool: unknown): string {
	return typeof tool === "object" &&
		tool !== null &&
		"description" in tool &&
		typeof tool.description === "string"
		? tool.description
		: "";
}

let fake: FakeOpenRouter | undefined;
beforeEach(() => vi.stubEnv("OPENROUTER_API_KEY", ""));
afterEach(async () => {
	vi.unstubAllEnvs();
	await fake?.close();
	fake = undefined;
});

async function engineWith(replies: ReadonlyArray<FakeReply>, knowledge = new CatalogKnowledge()) {
	const server = await startFakeOpenRouter(replies);
	fake = server;
	const engine = createEngine({
		profiles: [BIKES],
		knowledge,
		model: { id: "acme/small-model", apiKey: "test-key", baseURL: server.baseURL },
	});
	return { engine, server, knowledge };
}

describe("the agent's tools", () => {
	it("are on the agent, hydrated from the catalog, and follow an ingest", async () => {
		const { engine, knowledge } = await engineWith([]);
		const agent = engine.guide("harbour-bikes").agent;
		const tools = await agent.listTools();
		expect(Object.keys(tools).sort()).toEqual([
			"findPage",
			"getEntry",
			"listTopics",
			"rentalDesk",
			"searchKnowledge",
		]);
		expect(descriptionOf(tools.searchKnowledge)).toContain("1 entries; topics: rental");
		knowledge.entries.push({
			item: {
				id: "helmets",
				title: "Helmets",
				url: "/helmets",
				kind: "operational",
				topic: "safety",
				chunks: 1,
			},
			passages: [passage(HELMETS, HELMET_TEXT)],
		});
		const after = await agent.listTools();
		expect(descriptionOf(after.searchKnowledge)).toContain("2 entries; topics: rental, safety");
		expect(descriptionOf(after.getEntry)).toContain('helmets "Helmets"');
		expect(JSON.stringify(descriptionOf(after.searchKnowledge))).not.toContain(HELMET_TEXT);
	});

	it("put no passage in the prompt: the model reads content only through a tool, and cites it", async () => {
		const { engine, server } = await engineWith([
			{ kind: "text", chunks: ["Bikes are rented by the hour at the harbour desk [1]."] },
		]);
		const events = await collect(
			engine.guide("harbour-bikes").ask({ question: "How do I rent a bike?", locale: "en" }),
		);
		expect(shape(events)).toEqual(["thinking", "text", "sources", "done"]);
		expect(answerText(events)).toBe("Bikes are rented by the hour at the harbour desk [1].");
		for (const request of [...server.searches, ...server.requests]) {
			expect(systemText(request)).not.toContain("harbour desk, from 9");
			expect(systemText(request)).not.toContain("<passages>");
		}
		expect(server.searches).toHaveLength(1);
		expect(JSON.stringify(server.requests[0]?.body)).toContain("harbour desk, from 9 to 18");
	});

	it("drops a citation to a passage no tool returned, and cites nothing", async () => {
		const server = await startFakeOpenRouter(
			[{ kind: "text", chunks: ["Bikes are rented by the hour at the harbour desk [1]."] }],
			{},
			{ autoSearch: false },
		);
		fake = server;
		const engine = createEngine({
			profiles: [BIKES],
			knowledge: new CatalogKnowledge(),
			model: { id: "acme/small-model", apiKey: "test-key", baseURL: server.baseURL },
		});
		const events = await collect(
			engine.guide("harbour-bikes").ask({ question: "How do I rent a bike?", locale: "en" }),
		);
		expect(shape(events)).toEqual(["thinking", "text", "done"]);
		expect(answerText(events)).not.toContain("[1]");
	});

	it(`allows at most ${MAX_TOOL_CALLS} tool calls; later ones return nothing`, async () => {
		const searches: Array<FakeReply> = Array.from({ length: MAX_TOOL_CALLS + 1 }, (_, i) => ({
			kind: "tool",
			query: `bike ${i}`,
		}));
		const { engine, server, knowledge } = await engineWith([
			...searches,
			{ kind: "text", chunks: ["Bikes are rented by the hour at the harbour desk [1]."] },
		]);
		const events = await collect(
			engine.guide("harbour-bikes").ask({ question: "How do I rent a bike?", locale: "en" }),
		);
		// The tool calls within the budget reached the knowledge; the extra one did not.
		expect(knowledge.queries).toHaveLength(MAX_TOOL_CALLS);
		expect(JSON.stringify(server.requests.at(-1)?.body)).toContain("Tool call limit");
		expect(shape(events).at(-1)).toBe("done");
	});
});
