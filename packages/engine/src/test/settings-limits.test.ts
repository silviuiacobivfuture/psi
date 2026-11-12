import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineFailure } from "../ask-context";
import { createEngine, type EngineOptions } from "../engine";
import type { Profile } from "../profile";
import { createMemoryRateLimiter } from "../screening/rate-limit";
import { createSettingsSource, DEFAULT_SETTINGS } from "../settings";
import {
	collect,
	FakeKnowledge,
	type FakeOpenRouter,
	passage,
	shape,
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
const WELCOME = "Hi, I'm the Harbour Bikes helper: ask me about renting a bike.";
const BIKES_EN = BIKES.locales.en;
if (BIKES_EN === undefined) throw new Error("the bikes profile has no English");
const PROFILE: Profile = { ...BIKES, locales: { en: { ...BIKES_EN, welcome: WELCOME } } };

let fake: FakeOpenRouter | undefined;
beforeEach(() => vi.stubEnv("OPENROUTER_API_KEY", ""));
afterEach(async () => {
	vi.unstubAllEnvs();
	await fake?.close();
	fake = undefined;
});

/** An engine on the fake OpenRouter; every answer is the same cited sentence. */
async function engineWith(extra: Partial<EngineOptions> = {}) {
	const server = await startFakeOpenRouter(
		Array.from(
			{ length: 40 },
			() => ({ kind: "text", chunks: ["Bikes are rented by the hour [1]."] }) as const,
		),
	);
	fake = server;
	const failures: Array<EngineFailure> = [];
	const engine = createEngine({
		profiles: [PROFILE],
		knowledge: new FakeKnowledge(Array.from({ length: 40 }, () => FOUND)),
		model: { id: "acme/small-model", apiKey: "test-key", baseURL: server.baseURL },
		screening: { model: false },
		onFailure: (f) => failures.push(f),
		...extra,
	});
	const ask = (question: string, visitorKeys: ReadonlyArray<string>) =>
		collect(engine.guide("harbour-bikes").ask({ question, locale: "en" }, { visitorKeys }));
	return { engine, server, failures, ask };
}

describe("the exchange limit", () => {
	it.each([
		"session",
		"browser",
		"fingerprint",
	])("refuses the 21st exchange on the %s key alone, the others fresh each time", async (which) => {
		const { ask } = await engineWith();
		for (let i = 1; i <= 21; i += 1) {
			const keys = ["session", "browser", "fingerprint"].map((k) =>
				k === which ? `${k}:same` : `${k}:fresh-${i}`,
			);
			const events = await ask("How do I rent a bike?", keys);
			if (i <= 20) expect(shape(events).at(-1)).toBe("done");
			if (i <= 20) expect(shape(events)).not.toContain("refusal:exchange_limit");
			else expect(shape(events)).toEqual(["refusal:exchange_limit", "done"]);
		}
	});

	it("counts refused questions too, and never blocks a crisis", async () => {
		const { ask } = await engineWith({ settings: async () => ({ exchangeLimit: 2 }) });
		const keys = ["session:a"];
		expect(shape(await ask("Should I sue the lawyer?", keys))).toEqual([
			"refusal:out_of_scope",
			"done",
		]);
		expect(shape(await ask("How do I rent a bike?", keys)).at(-1)).toBe("done");
		expect(shape(await ask("How do I rent a bike?", keys))).toEqual([
			"refusal:exchange_limit",
			"done",
		]);
		expect(shape(await ask("I crashed and I'm bleeding", keys))).toEqual([
			"refusal:crisis",
			"done",
		]);
	});

	it("opens a new window when the old one has passed", async () => {
		let now = 0;
		const exchangeLimiter = createMemoryRateLimiter({ now: () => now });
		const { ask } = await engineWith({
			settings: async () => ({ exchangeLimit: 1, exchangeWindowHours: 1 }),
			screening: { model: false, exchangeLimiter },
		});
		expect(shape(await ask("How do I rent a bike?", ["browser:b"]))).not.toContain(
			"refusal:exchange_limit",
		);
		expect(shape(await ask("How do I rent a bike?", ["browser:b"]))).toEqual([
			"refusal:exchange_limit",
			"done",
		]);
		now += 3_600_000;
		expect(shape(await ask("How do I rent a bike?", ["browser:b"]))).not.toContain(
			"refusal:exchange_limit",
		);
	});

	it("applies a settings change at once", async () => {
		let limit = 1;
		const { ask } = await engineWith({ settings: async () => ({ exchangeLimit: limit }) });
		await ask("How do I rent a bike?", ["session:c"]);
		expect(shape(await ask("How do I rent a bike?", ["session:c"]))).toEqual([
			"refusal:exchange_limit",
			"done",
		]);
		limit = 5;
		expect(shape(await ask("How do I rent a bike?", ["session:c"]))).not.toContain(
			"refusal:exchange_limit",
		);
	});

	it("applies no exchange limit without visitor keys", async () => {
		const { ask } = await engineWith({ settings: async () => ({ exchangeLimit: 1 }) });
		for (let i = 0; i < 3; i += 1) {
			expect(shape(await ask("How do I rent a bike?", []))).not.toContain("refusal:exchange_limit");
		}
	});
});

describe("the runtime settings", () => {
	it("guideEnabled=false answers unavailable and reports the disabled stage", async () => {
		const { ask, failures, server } = await engineWith({
			settings: async () => ({ guideEnabled: false }),
		});
		expect(shape(await ask("How do I rent a bike?", []))).toEqual(["refusal:unavailable", "done"]);
		expect(failures.map((f) => f.stage)).toEqual(["disabled"]);
		expect(server.requests).toHaveLength(0);
	});

	it("reads a CMS ai-settings answer as it comes (extra fields ignored)", async () => {
		const source = createSettingsSource({
			provider: async () => ({
				embeddings: "lexical",
				embedModel: "openai/text-embedding-3-large",
				deepSearch: true,
				guideEnabled: true,
				exchangeLimit: 7,
				exchangeWindowHours: 12,
				screeningLevel: "strict",
				updatedBy: "Editor",
				updatedAt: "2026-11-12T10:00:00.000Z",
			}),
			timeoutMs: 100,
		});
		expect(await source.current()).toEqual({
			embeddings: "lexical",
			embedModel: "openai/text-embedding-3-large",
			deepSearch: true,
			guideEnabled: true,
			exchangeLimit: 7,
			exchangeWindowHours: 12,
			screeningLevel: "strict",
		});
	});

	it("falls back to the last good settings, then to the defaults", async () => {
		const errors: Array<unknown> = [];
		let answer: () => Promise<unknown> = async () => ({ exchangeLimit: 3 });
		const source = createSettingsSource({
			provider: () => answer(),
			timeoutMs: 100,
			onError: (e) => errors.push(e),
		});
		expect((await source.current()).exchangeLimit).toBe(3);
		answer = async () => {
			throw new Error("cms down");
		};
		expect((await source.current()).exchangeLimit).toBe(3);
		answer = async () => ({ exchangeLimit: "lots" });
		expect((await source.current()).exchangeLimit).toBe(3);
		answer = () => new Promise(() => undefined);
		expect((await source.current()).exchangeLimit).toBe(3);
		expect(errors).toHaveLength(3);

		const fresh = createSettingsSource({
			provider: async () => {
				throw new Error("cms down");
			},
			timeoutMs: 100,
		});
		expect(await fresh.current()).toEqual(DEFAULT_SETTINGS);
		expect(await createSettingsSource({ timeoutMs: 100 }).current()).toEqual(DEFAULT_SETTINGS);
	});

	it("a failing provider is reported as settings, and the guide still answers", async () => {
		const { ask, failures } = await engineWith({
			settings: async () => {
				throw new Error("cms down");
			},
		});
		expect(shape(await ask("How do I rent a bike?", ["session:z"])).at(-1)).toBe("done");
		expect(shape(await ask("How do I rent a bike?", ["session:z"]))).not.toContain(
			"refusal:unavailable",
		);
		expect(failures.every((f) => f.stage === "settings")).toBe(true);
	});
});

describe("small talk", () => {
	it.each([
		"hi",
		"Hello there!",
		"anything generic ?",
		"can you converse?",
		"What can you do?",
		"hi, can you talk with me?",
		"helo can u help",
		"Who are you",
		"thanks a lot!!",
		"hey, could we just chat",
	])("answers %j with the profile's welcome, without retrieval or a model call", async (question) => {
		const knowledge = new FakeKnowledge([FOUND]);
		const { server } = await engineWith();
		const engine = createEngine({
			profiles: [PROFILE],
			knowledge,
			model: { id: "acme/small-model", apiKey: "test-key", baseURL: server.baseURL },
		});
		const events = await collect(engine.guide("harbour-bikes").ask({ question, locale: "en" }));
		expect(events).toEqual([{ type: "text", delta: WELCOME }, { type: "done" }]);
		expect(knowledge.calls).toHaveLength(0);
		expect(server.requests).toHaveLength(0);
	});

	it("answers a thank-you with the profile's thanks line", async () => {
		const thanked: Profile = {
			...PROFILE,
			locales: { en: { ...BIKES_EN, welcome: WELCOME, thanks: "You're welcome!" } },
		};
		const engine = createEngine({
			profiles: [thanked],
			knowledge: new FakeKnowledge([]),
			model: { id: "acme/small-model" },
		});
		for (const question of ["thanks!", "thank you so much", "thx a lot", "Thnaks"]) {
			const events = await collect(engine.guide("harbour-bikes").ask({ question, locale: "en" }));
			expect(events).toEqual([{ type: "text", delta: "You're welcome!" }, { type: "done" }]);
		}
		const hi = await collect(engine.guide("harbour-bikes").ask({ question: "hi", locale: "en" }));
		expect(hi).toEqual([{ type: "text", delta: WELCOME }, { type: "done" }]);
	});

	it("is not a question that names a topic", async () => {
		const { ask, server } = await engineWith();
		const events = await ask("hi, can you tell me about bike rental prices?", []);
		expect(events).not.toContainEqual({ type: "text", delta: WELCOME });
		expect(server.requests.length).toBeGreaterThan(0);
	});

	it("answers with the welcome when nothing is found and no topic is named", async () => {
		const server = await startFakeOpenRouter([{ kind: "text", chunks: ["x"] }]);
		fake = server;
		const engine = createEngine({
			profiles: [PROFILE],
			knowledge: new FakeKnowledge([{ kind: "passages", passages: [] }]),
			model: { id: "acme/small-model", apiKey: "test-key", baseURL: server.baseURL },
		});
		const guide = engine.guide("harbour-bikes");
		const vague = await collect(guide.ask({ question: "and which is it then?", locale: "en" }));
		expect(vague).toEqual([
			{ type: "thinking" },
			{ type: "text", delta: WELCOME },
			{ type: "done" },
		]);
		const topical = await collect(guide.ask({ question: "Do you have parking?", locale: "en" }));
		expect(shape(topical)).toEqual(["thinking", "refusal:no_content", "done"]);
		expect(server.requests).toHaveLength(0);
	});

	it("still screens small talk first: a crisis is never answered with the welcome", async () => {
		const { ask } = await engineWith();
		expect(shape(await ask("hi, I crashed and I'm bleeding", []))).toEqual([
			"refusal:crisis",
			"done",
		]);
	});
});
