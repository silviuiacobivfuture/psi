import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineKnowledge } from "../contract";
import { createEngine } from "../engine";
import {
	type ArticleQuery,
	type EngineArticles,
	FIND_ARTICLES_TOOL,
} from "../grounding/article-tool";
import { collect, startFakeOpenRouter } from "../testing";
import { BIKES } from "./consumer-profiles";

const knowledge: EngineKnowledge = { search: async () => [] };
const HIT = {
	title: "Cum alegi o bicicletă",
	standfirst: "Ghid scurt.",
	topic: "biciclete",
	brand: "bikes",
	url: "https://blog.example.test/articole/cum-alegi",
	readingMinutes: 4,
	date: "2026-10-01",
};

async function call(tool: unknown, input: object): Promise<unknown> {
	if (typeof tool !== "object" || tool === null || !("execute" in tool)) {
		throw new Error("not an executable tool");
	}
	return await Reflect.apply(Object(tool).execute, tool, [input, {}]);
}

beforeEach(() => vi.stubEnv("OPENROUTER_API_KEY", ""));
afterEach(() => vi.unstubAllEnvs());

function engineWith(articles: EngineArticles | undefined) {
	return createEngine({
		profiles: [BIKES],
		knowledge,
		model: { id: "acme/small-model", apiKey: "test-key" },
		...(articles === undefined ? {} : { articles }),
	});
}

describe("the findArticles tool", () => {
	it("does not exist unless the consumer gave articles", async () => {
		const tools = await engineWith(undefined).guide("harbour-bikes").agent.listTools();
		expect(Object.keys(tools)).not.toContain(FIND_ARTICLES_TOOL);
	});

	it("asks the consumer's port as the asking profile, in the profile's locale, and returns links only", async () => {
		const asked: Array<ArticleQuery> = [];
		const articles: EngineArticles = {
			find: (q) => {
				asked.push(q);
				return { total: 9, articles: [HIT], topics: ["biciclete"], brands: ["bikes"] };
			},
		};
		const tools = await engineWith(articles).guide("harbour-bikes").agent.listTools();
		const tool = tools[FIND_ARTICLES_TOOL];
		const out = await call(tool, { query: " biciclete ", topic: "", brand: "bikes" });
		expect(asked).toEqual([
			{ profile: "harbour-bikes", locale: "en", query: "biciclete", brand: "bikes", limit: 6 },
		]);
		expect(out).toEqual({ total: 9, articles: [HIT], topics: ["biciclete"], brands: ["bikes"] });
	});

	it("tells the model plainly when nothing matches", async () => {
		const articles: EngineArticles = {
			find: () => ({ total: 0, articles: [], topics: [], brands: [] }),
		};
		const tools = await engineWith(articles).guide("harbour-bikes").agent.listTools();
		const out = await call(tools[FIND_ARTICLES_TOOL], {});
		expect(JSON.stringify(out)).toContain("No article matches");
	});

	it("rejects a port that is not one, at startup", () => {
		expect(() =>
			createEngine({
				profiles: [BIKES],
				knowledge,
				model: { id: "acme/small-model" },
				// @ts-expect-error a port without find is the misconfiguration under test
				articles: {},
			}),
		).toThrow(/articles must have a find function/);
	});
});

describe("article chips", () => {
	const PANIC = {
		...HIT,
		title: "Stres sau anxietate: care este diferența",
		url: "https://blog.example.test/articole/stres",
	};
	const OTHER = {
		...HIT,
		title: "Respirația lentă",
		url: "https://blog.example.test/articole/respiratia",
	};
	const articles: EngineArticles = {
		find: () => ({ total: 2, articles: [PANIC, OTHER], topics: [], brands: [] }),
	};

	async function ask(reply: string) {
		const server = await startFakeOpenRouter(
			[
				{ kind: "tool", query: "", tool: "findArticles", input: { query: "stres" } },
				{ kind: "text", chunks: [reply] },
			],
			{},
			{ autoSearch: false },
		);
		try {
			const engine = createEngine({
				profiles: [BIKES],
				knowledge,
				articles,
				model: { id: "acme/small-model", apiKey: "test-key", baseURL: server.baseURL },
			});
			return await collect(
				engine
					.guide("harbour-bikes")
					.ask({ question: "Do you have an article about stress?", locale: "en" }),
			);
		} finally {
			await server.close();
		}
	}

	function chips(events: Awaited<ReturnType<typeof ask>>): Array<string> {
		return events.flatMap((e) =>
			e.type === "sources" ? e.sources.map((s) => `${s.title}|${s.url}`) : [],
		);
	}

	it("links the articles a reply names by title, without the model writing any address", async () => {
		const events = await ask("Try “Stres sau anxietate: care este diferența” for a start.");
		expect(chips(events)).toEqual([`${PANIC.title}|${PANIC.url}`]);
	});

	it("links by address too, once each, in the order the tool returned them", async () => {
		const events = await ask(
			`Read ${OTHER.url} and also Stres sau anxietate: care este diferența.`,
		);
		expect(chips(events)).toEqual([`${PANIC.title}|${PANIC.url}`, `${OTHER.title}|${OTHER.url}`]);
	});

	it("attaches nothing for articles the reply does not name", async () => {
		const events = await ask("There is nothing on that yet, but write to us.");
		expect(chips(events)).toEqual([]);
	});
});
