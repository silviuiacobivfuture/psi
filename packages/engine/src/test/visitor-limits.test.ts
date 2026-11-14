import { ASSISTANT_DEFAULT_MODEL } from "@psi/scheduling-sdk/contract";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "../profile";
import { answerText, chatBody, type FakeOpenRouter, shape } from "../testing";
import { BIKES } from "./consumer-profiles";
import {
	FakeVisitorStore,
	governed,
	type Harness,
	PAUSED,
	PLATFORM,
	TENANT,
} from "./visitor-harness";

let open: Harness | undefined;
beforeEach(() => vi.stubEnv("OPENROUTER_API_KEY", ""));
afterEach(async () => {
	vi.unstubAllEnvs();
	await open?.server.close();
	open = undefined;
});
const start = async (...args: Parameters<typeof governed>): Promise<Harness> => {
	open = await governed(...args);
	return open;
};
const modelCalls = (server: FakeOpenRouter): number =>
	server.requests.length + server.searches.length;
const ZERO = {
	messages: 0,
	inputTokens: 0,
	outputTokens: 0,
	cachedTokens: 0,
	costMicroUsd: 0,
	limitHits: 0,
};
const LIMIT_MET = { tenant: TENANT, usage: { ...ZERO, limitHits: 1 } };

describe("the organisation's limits stop the turn before any model call", () => {
	it.each([
		["switched off", (s: FakeVisitorStore) => s.set({ enabled: false })],
		[
			"the month's budget spent, with the hard stop",
			(s: FakeVisitorStore) => {
				s.month.costMicroUsd = 50_000_000;
			},
		],
		[
			"the month's tokens used",
			(s: FakeVisitorStore) => {
				s.month.inputTokens = 300_000_000;
			},
		],
		[
			"the day's tokens used",
			(s: FakeVisitorStore) => {
				s.day.outputTokens = 20_000_000;
			},
		],
	])("%s: the warm line and the booking button, a limit met recorded, nothing else", async (_, arrange) => {
		const store = new FakeVisitorStore();
		arrange(store);
		const { ask, server } = await start(store);
		const events = await ask("How do I rent a bike?");
		expect(shape(events)).toEqual(["text", "actions", "done"]);
		expect(answerText(events)).toBe(PAUSED);
		expect(events).toContainEqual({
			type: "actions",
			actions: [{ kind: "link", label: "Book at the desk", href: "/book" }],
		});
		expect(modelCalls(server)).toBe(0);
		expect(store.records).toEqual([LIMIT_MET]);
	});

	it("one unit under each limit still answers", async () => {
		const store = new FakeVisitorStore();
		store.month.costMicroUsd = 49_999_999;
		store.month.inputTokens = 299_999_999 - 20_000_000;
		store.day.inputTokens = 19_999_999;
		const { ask } = await start(store);
		expect(shape(await ask("How do I rent a bike?")).at(-1)).toBe("done");
		expect(answerText(await ask("How do I rent a bike?"))).toContain("rented by the hour");
	});

	it("a spent budget without the hard stop answers", async () => {
		const store = new FakeVisitorStore().set({ budget: { hardStop: false } });
		store.month.costMicroUsd = 90_000_000;
		const { ask } = await start(store);
		expect(answerText(await ask("How do I rent a bike?"))).toContain("rented by the hour");
	});

	it("a profile without the fallback copy says unavailable instead", async () => {
		const store = new FakeVisitorStore().set({ enabled: false });
		const bare: Profile = { ...BIKES, scheduling: { tenant: TENANT, services: [] } };
		const { ask, server } = await start(store, undefined, { profiles: [bare] });
		expect(shape(await ask("How do I rent a bike?"))).toEqual(["refusal:unavailable", "done"]);
		expect(modelCalls(server)).toBe(0);
		expect(store.records).toEqual([LIMIT_MET]);
	});

	it("a crisis is never stopped: its own refusal comes first, and it is not a limit met", async () => {
		const store = new FakeVisitorStore().set({ enabled: false });
		const { ask } = await start(store);
		expect(shape(await ask("I crashed and I am bleeding"))).toEqual(["refusal:crisis", "done"]);
		expect(store.records).toEqual([{ tenant: TENANT, usage: { ...ZERO, messages: 1 } }]);
	});

	it("the store's switch wins over the CMS's: on in the store, off in the CMS, it answers", async () => {
		const store = new FakeVisitorStore().set({ enabled: true });
		const { ask } = await start(store, undefined, {
			settings: async () => ({ guideEnabled: false }),
		});
		expect(answerText(await ask("How do I rent a bike?"))).toContain("rented by the hour");
	});
});

describe("the organisation's limits per visitor", () => {
	it("messages per day per visitor key: the next one is the exchange limit, counted as a limit met", async () => {
		const store = new FakeVisitorStore().set({ messages: { perDay: 2 } });
		const { ask, server } = await start(store, undefined, {
			settings: async () => ({ exchangeLimit: 100 }),
		});
		const keys = { visitorKeys: ["session:one"] };
		for (let i = 0; i < 2; i += 1)
			expect(shape(await ask("How do I rent a bike?", keys)).at(-1)).toBe("done");
		const calls = modelCalls(server);
		expect(shape(await ask("How do I rent a bike?", keys))).toEqual([
			"refusal:exchange_limit",
			"done",
		]);
		expect(modelCalls(server)).toBe(calls);
		expect(store.records.at(-1)).toEqual(LIMIT_MET);
		expect(shape(await ask("How do I rent a bike?", { visitorKeys: ["session:two"] })).at(-1)).toBe(
			"done",
		);
	});

	it("messages per conversation: the visitor's earlier questions count, the next past the number is refused", async () => {
		const store = new FakeVisitorStore().set({ messages: { perSession: 2 } });
		const { ask, server } = await start(store);
		const history = [
			{ role: "user" as const, text: "Hello" },
			{ role: "guide" as const, text: "Hi! Ask me about bikes." },
		];
		expect(shape(await ask("How do I rent a bike?", {}, { history })).at(-1)).toBe("done");
		const twice = [
			...history,
			{ role: "user" as const, text: "And kids?" },
			{ role: "guide" as const, text: "Yes." },
		];
		const calls = modelCalls(server);
		expect(shape(await ask("How do I rent a bike?", {}, { history: twice }))).toEqual([
			"refusal:exchange_limit",
			"done",
		]);
		expect(modelCalls(server)).toBe(calls);
		expect(store.records.at(-1)).toEqual(LIMIT_MET);
	});

	it("messages per minute per client: the organisation's number, not the limiter's own", async () => {
		const store = new FakeVisitorStore().set({ ratePerMinute: 2 });
		const { ask } = await start(store);
		const c = { clientId: "client:a" };
		expect(shape(await ask("How do I rent a bike?", c)).at(-1)).toBe("done");
		expect(shape(await ask("How do I rent a bike?", c)).at(-1)).toBe("done");
		expect(shape(await ask("How do I rent a bike?", c))).toEqual(["refusal:rate_limited", "done"]);
		expect(store.records.at(-1)).toEqual(LIMIT_MET);
	});
});

describe("the reply runs on the organisation's model and limits", () => {
	it("model and fallbacks, temperature, and the answer capped by the tokens per request", async () => {
		const store = new FakeVisitorStore().set({
			model: { primary: "acme/primary", fallbacks: ["acme/backup"] },
			temperature: 0.3,
			maxOutputTokens: 2_000,
			tokens: { perRequest: 1_500 },
		});
		store.platform = PLATFORM;
		const { ask, server } = await start(store);
		await ask("How do I rent a bike?");
		const body = server.requests.at(-1)?.body;
		expect(chatBody(server.requests.at(-1)).model).toBe("acme/primary");
		expect(body).toMatchObject({
			models: ["acme/primary", "acme/backup"],
			max_tokens: 1_500,
			usage: { include: true },
		});
	});

	it("the organisation's temperature, on a model Mastra sends one to", async () => {
		const store = new FakeVisitorStore().set({ temperature: 0.3 });
		const { ask, server } = await start(store, undefined, {
			settings: async () => ({ behaviour: { creativity: "creative" } }),
		});
		await ask("How do I rent a bike?");
		expect(chatBody(server.requests.at(-1)).model).toBe(ASSISTANT_DEFAULT_MODEL);
		expect(server.requests.at(-1)?.body).toMatchObject({ temperature: 0.3 });
	});

	it("the longest answer holds when it is the lower one", async () => {
		const store = new FakeVisitorStore().set({ maxOutputTokens: 900 });
		const { ask, server } = await start(store);
		await ask("How do I rent a bike?");
		expect(server.requests.at(-1)?.body).toMatchObject({ max_tokens: 900 });
	});

	it("tool calls: the organisation's number, then the tools say the limit was reached", async () => {
		const store = new FakeVisitorStore().set({ maxToolCalls: 1 });
		const { ask, server } = await start(store, [
			{ kind: "tool", query: "bikes" },
			{ kind: "tool", query: "prices" },
			{ kind: "text", chunks: ["Bikes are rented by the hour [1]."] },
		]);
		await ask("How do I rent a bike?");
		expect(JSON.stringify(server.requests.at(-1)?.body)).toContain("Tool call limit (1)");
	});

	it("once the turn's tokens reach the tokens per request, the next step may call no tool", async () => {
		const store = new FakeVisitorStore().set({ tokens: { perRequest: 1_000 } });
		const { ask, server } = await start(store, [
			{ kind: "tool", query: "bikes", usage: { prompt: 900, completion: 150 } },
			{ kind: "text", chunks: ["Bikes are rented by the hour [1]."] },
		]);
		await ask("How do I rent a bike?");
		expect(chatBody(server.requests.at(-1)).tool_choice).toBe("none");
	});

	it("under the tokens per request the tools stay offered", async () => {
		const store = new FakeVisitorStore().set({ tokens: { perRequest: 100_000 } });
		const { ask, server } = await start(store, [
			{ kind: "tool", query: "bikes", usage: { prompt: 900, completion: 150 } },
			{ kind: "text", chunks: ["Bikes are rented by the hour [1]."] },
		]);
		await ask("How do I rent a bike?");
		expect(chatBody(server.requests.at(-1)).tool_choice).not.toBe("none");
	});

	it("the history read back is the organisation's number of messages", async () => {
		const store = new FakeVisitorStore().set({ memory: { historyMessages: 2 } });
		const { ask, server } = await start(store);
		const history = Array.from({ length: 6 }, (_, i) =>
			i % 2 === 0
				? { role: "user" as const, text: `question ${i}` }
				: { role: "guide" as const, text: `answer ${i}` },
		);
		await ask("How do I rent a bike?", {}, { history });
		const sent = chatBody(server.requests.at(-1)).messages.filter(
			(m) => m.role === "user" || m.role === "assistant",
		);
		const texts = JSON.stringify(sent);
		expect(texts).toContain("question 4");
		expect(texts).toContain("answer 5");
		expect(texts).not.toContain("answer 3");
	});
});

describe("what a turn used reaches the organisation's meters", () => {
	it("tokens, the cached part and the cost of the reply, as one message", async () => {
		const store = new FakeVisitorStore();
		const { ask } = await start(store, [
			{
				kind: "text",
				chunks: ["Bikes are rented by the hour [1]."],
				usage: { prompt: 900, completion: 100, cached: 300, cost: 0.000037 },
			},
		]);
		await ask("How do I rent a bike?");
		expect(store.records).toHaveLength(1);
		expect(store.records[0]?.usage).toMatchObject({
			messages: 1,
			limitHits: 0,
			outputTokens: 100,
			cachedTokens: 300,
			costMicroUsd: 37,
		});
		expect(store.records[0]?.usage.inputTokens).toBeGreaterThanOrEqual(900);
	});

	it("a provider failure and its retry: what the retry used is counted, once, as one message", async () => {
		const store = new FakeVisitorStore();
		const { ask } = await start(store, [
			{ kind: "status", status: 500 },
			{
				kind: "text",
				chunks: ["Bikes are rented by the hour [1]."],
				usage: { prompt: 500, completion: 50, cost: 0.00001 },
			},
		]);
		expect(answerText(await ask("How do I rent a bike?"))).toContain("rented by the hour");
		expect(store.records).toHaveLength(1);
		expect(store.records[0]?.usage).toMatchObject({
			messages: 1,
			outputTokens: 50,
			costMicroUsd: 10,
		});
	});

	it("a regenerated reply: both calls are counted", async () => {
		const store = new FakeVisitorStore();
		const same = "Bikes are rented by the hour [1].";
		const used = { prompt: 400, completion: 40, cost: 0.00002 };
		const { ask } = await start(store, [
			{ kind: "text", chunks: [same], usage: used },
			{ kind: "text", chunks: ["You can rent one by the hour [1]."], usage: used },
		]);
		await ask(
			"How do I rent a bike?",
			{},
			{
				history: [
					{ role: "user", text: "How do I rent a bike?" },
					{ role: "guide", text: "Bikes are rented by the hour [1]." },
				],
			},
		);
		expect(store.records).toHaveLength(1);
		expect(store.records[0]?.usage).toMatchObject({
			messages: 1,
			outputTokens: 80,
			costMicroUsd: 40,
		});
	});
});

describe("when the store cannot be read", () => {
	it("before any good read: the built-in settings (the default model), the failure reported without the address", async () => {
		const store = new FakeVisitorStore();
		store.failing = true;
		const { ask, server, failures } = await start(store);
		expect(answerText(await ask("How do I rent a bike?"))).toContain("rented by the hour");
		expect(chatBody(server.requests.at(-1)).model).toBe(ASSISTANT_DEFAULT_MODEL);
		const failure = failures.find((f) => f.stage === "settings");
		expect(failure?.error).toContain("store unreachable");
		expect(failure?.error).not.toContain("visitor@example.com");
	});

	it("after a good read: the last good settings hold (switched off stays off)", async () => {
		const store = new FakeVisitorStore().set({ enabled: false });
		const { ask } = await start(store);
		expect(answerText(await ask("How do I rent a bike?"))).toBe(PAUSED);
		store.failing = true;
		expect(answerText(await ask("How do I rent a bike?"))).toBe(PAUSED);
	});

	it.each([
		[
			"an organisation document that does not parse",
			(s: FakeVisitorStore) => {
				s.org = '{"revision":1}';
			},
		],
		[
			"an estate document that does not parse",
			(s: FakeVisitorStore) => {
				s.platform = '{"defaults":3}';
			},
		],
		[
			"an app the store does not have",
			(s: FakeVisitorStore) => {
				s.missing = true;
			},
		],
	])("%s is a failed read: reported, the built-in settings answer", async (_, arrange) => {
		const store = new FakeVisitorStore();
		arrange(store);
		const { ask, failures } = await start(store);
		expect(answerText(await ask("How do I rent a bike?"))).toContain("rented by the hour");
		expect(failures.map((f) => f.stage)).toContain("settings");
	});
});
