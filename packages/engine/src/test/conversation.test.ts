import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEngine } from "../engine";
import { createClaimsCheck } from "../grounding/claims-check";
import { ENGLISH } from "../language/en";
import { ROMANIAN } from "../language/ro";
import type { Profile } from "../profile";
import {
	answerText,
	collect,
	FakeKnowledge,
	type FakeOpenRouter,
	type FakeReply,
	passage,
	shape,
	source,
	stages,
	startFakeOpenRouter,
	systemText,
} from "../testing";
import { createSentences } from "../text/sentences";
import type { EngineTiming } from "../timing";
import { BIKES } from "./consumer-profiles";

const FOUND = {
	kind: "passages",
	passages: [
		passage(source("rental", "Renting a bike"), "Bikes are rented by the hour, from 9 to 18."),
	],
} as const;
const BIKES_EN = BIKES.locales.en;
if (BIKES_EN === undefined) throw new Error("the bikes profile has no English");
const UNKNOWN = "I couldn't find that in our pages; the desk can tell you.";
const PROFILE: Profile = {
	...BIKES,
	// Romanian too, so a Romanian reply on the English site is recognised as another language.
	locales: {
		en: { ...BIKES_EN, welcome: "Hi, ask me about bikes.", unknown: UNKNOWN },
		ro: BIKES_EN,
	},
};

let fake: FakeOpenRouter | undefined;
beforeEach(() => vi.stubEnv("OPENROUTER_API_KEY", ""));
afterEach(async () => {
	vi.unstubAllEnvs();
	await fake?.close();
	fake = undefined;
});

async function guideWith(replies: ReadonlyArray<FakeReply>, autoSearch = true) {
	const server = await startFakeOpenRouter(replies, {}, { autoSearch });
	fake = server;
	const knowledge = new FakeKnowledge(Array.from({ length: 10 }, () => FOUND));
	const engine = createEngine({
		profiles: [PROFILE],
		knowledge,
		model: { id: "acme/small-model", apiKey: "test-key", baseURL: server.baseURL },
		screening: { model: false },
	});
	return { guide: engine.guide("harbour-bikes"), server, knowledge };
}

describe("the claims post-check", () => {
	const claims = createClaimsCheck([ENGLISH, ROMANIAN], createSentences([]));

	it("passes conversation, and facts the tool results carry", () => {
		const reply = "Of course! Bikes are rented from 9 to 18 [1]. Would you like to book one?";
		const verdict = claims.check(reply, { passages: ["Open from 9 to 18."], own: [] });
		expect(verdict.flagged).toEqual([]);
		expect(verdict.kept).toBe(reply);
	});

	it("flags a figure, a price or a clinical term nothing shown carries, and keeps the rest", () => {
		const verdict = claims.check(
			"Happy to help. A day costs 40 lei. This treatment cures anxiety. Call us on 0700 000 000.",
			{ passages: ["Bikes are rented by the hour."], own: [] },
		);
		expect(verdict.flagged).toHaveLength(3);
		expect(verdict.kept).toBe("Happy to help.");
	});

	it("accepts a phone number written with other spacing than the passage's", () => {
		const verdict = claims.check("Call 0748017752 [1].", {
			passages: ["Phone: 0748 017 752"],
			own: [],
		});
		expect(verdict.flagged).toEqual([]);
	});
});

describe("a conversation-first turn", () => {
	it("replies to small talk, a test or gibberish without a search, in new words each time", async () => {
		const replies = [
			"Hi there, what can I help with?",
			"All working on my side.",
			"Did you mean something else?",
		];
		const { guide, knowledge, server } = await guideWith(
			replies.map((r) => ({ kind: "text", chunks: [r] })),
			false,
		);
		const history: Array<{ role: "user" | "guide"; text: string }> = [];
		const out: Array<string> = [];
		for (const question of ["hi", "test", "qwe"]) {
			const events = await collect(guide.ask({ question, locale: "en", history }));
			expect(shape(events)).toEqual(["thinking", "text", "done"]);
			const text = answerText(events);
			out.push(text);
			history.push({ role: "user", text: question }, { role: "guide", text });
		}
		expect(out).toEqual(replies);
		expect(knowledge.calls).toHaveLength(0);
		expect(server.requests).toHaveLength(3);
	});

	it("retries a reply in another language once with a stricter note", async () => {
		const { guide, server } = await guideWith(
			[
				{ kind: "text", chunks: ["Bună, cu ce te pot ajuta astăzi la închirieri?"] },
				{ kind: "text", chunks: ["Hello, how can I help with renting today?"] },
			],
			false,
		);
		const events = await collect(guide.ask({ question: "salut", locale: "en" }));
		expect(answerText(events)).toBe("Hello, how can I help with renting today?");
		expect(systemText(server.requests[1])).toContain("Write ONLY in English");
	});

	it("falls back to the canned line, never unavailable, when the language is still wrong", async () => {
		const { guide } = await guideWith(
			[{ kind: "text", chunks: ["Bună, cu ce te pot ajuta astăzi la închirieri?"] }],
			false,
		);
		const events = await collect(guide.ask({ question: "salut", locale: "en" }));
		expect(events).toContainEqual({ type: "replace", text: "Hi, ask me about bikes." });
		expect(answerText(events)).toBe("Hi, ask me about bikes.");
		expect(shape(events)).not.toContain("refusal:unavailable");
	});

	it("regenerates an invented figure once, then leaves the sentence out", async () => {
		const { guide, server } = await guideWith([
			{ kind: "text", chunks: ["Bikes are rented by the hour [1]. A day costs 40 lei."] },
		]);
		const events = await collect(guide.ask({ question: "How much is a bike?", locale: "en" }));
		expect(systemText(server.requests.at(-1))).toContain("State only facts from the tool results");
		expect(answerText(events)).toBe("Bikes are rented by the hour [1].");
		// Streamed, reset for the regeneration, streamed again, then corrected without the figure.
		expect(shape(events)).toEqual([
			"thinking",
			"text",
			"replace",
			"text",
			"replace",
			"sources",
			"done",
		]);
	});

	it("says honestly it does not have that when every sentence was invented", async () => {
		const { guide } = await guideWith([{ kind: "text", chunks: ["A day costs 40 lei."] }]);
		const events = await collect(guide.ask({ question: "How much is a day?", locale: "en" }));
		expect(answerText(events)).toBe(UNKNOWN);
	});

	it("retries a reply identical to the previous one", async () => {
		const same = "Glad to help with bikes.";
		const { guide, server } = await guideWith(
			[
				{ kind: "text", chunks: [same] },
				{ kind: "text", chunks: ["Anything else about renting?"] },
			],
			false,
		);
		const events = await collect(
			guide.ask({
				question: "ok",
				locale: "en",
				history: [
					{ role: "user", text: "thanks" },
					{ role: "guide", text: same },
				],
			}),
		);
		expect(answerText(events)).toBe("Anything else about renting?");
		expect(systemText(server.requests[1])).toContain("Write a different reply");
	});

	it("renders nothing for an aborted turn: done alone, never unavailable", async () => {
		const { guide } = await guideWith([{ kind: "hang" }], false);
		const controller = new AbortController();
		setTimeout(() => controller.abort(), 50);
		const events = await collect(
			guide.ask({ question: "hi", locale: "en" }, { signal: controller.signal }),
		);
		expect(shape(events)).toEqual(["thinking", "done"]);
	});
	it("streams the reply as the model writes it, a citation never cut in two", async () => {
		const { guide } = await guideWith([
			{
				kind: "text",
				chunks: ["Bikes are ", "rented by the hour [", "1]. Happy riding."],
				delayMs: 5,
			},
		]);
		const events = await collect(guide.ask({ question: "How do I rent a bike?", locale: "en" }));
		const deltas = events.flatMap((e) => (e.type === "text" ? [e.delta] : []));
		expect(deltas.length).toBeGreaterThan(1);
		expect(deltas.some((d) => d.endsWith("["))).toBe(false);
		expect(answerText(events)).toBe("Bikes are rented by the hour [1]. Happy riding.");
		expect(shape(events)).toEqual(["thinking", "text", "sources", "done"]);
	});

	it("stops a reply in another language after its first sentences, and regenerates it", async () => {
		const { guide, server } = await guideWith(
			[
				{
					kind: "text",
					chunks: [
						"Bună, cu ce te pot ajuta astăzi? Poți să mă întrebi orice despre închirieri, ",
						"despre program și despre biciclete, iar eu îți spun tot ce știu.",
					],
					delayMs: 20,
				},
				{ kind: "text", chunks: ["Hello, how can I help with renting today?"] },
			],
			false,
		);
		const events = await collect(guide.ask({ question: "salut", locale: "en" }));
		expect(answerText(events)).toBe("Hello, how can I help with renting today?");
		expect(shape(events)).toContain("replace");
		expect(server.requests).toHaveLength(2);
	});

	it("leaves out a closing question already asked in the conversation, without regenerating", async () => {
		const closer = "Would you like to book one?";
		const { guide, server } = await guideWith([
			{ kind: "text", chunks: [`Bikes are rented by the hour [1]. ${closer}`] },
		]);
		const events = await collect(
			guide.ask({
				question: "And for a day?",
				locale: "en",
				history: [
					{ role: "user", text: "Can I rent a bike?" },
					{ role: "guide", text: `Yes, at the harbour desk. ${closer}` },
				],
			}),
		);
		expect(answerText(events)).toBe("Bikes are rented by the hour [1].");
		expect(server.requests).toHaveLength(1);
	});

	it("says what it is busy with: searching while a tool runs, checking before a regeneration", async () => {
		const { guide } = await guideWith([
			{ kind: "text", chunks: ["Bikes are rented by the hour [1]. A day costs 40 lei."] },
		]);
		const events = await collect(guide.ask({ question: "How much is a bike?", locale: "en" }));
		expect(stages(events)).toEqual(["searching", "checking", "searching"]);
	});

	it("reports where the turn's time went: counts and milliseconds only", async () => {
		const server = await startFakeOpenRouter([
			{ kind: "text", chunks: ["Bikes are rented by the hour [1]."] },
		]);
		fake = server;
		const timings: Array<EngineTiming> = [];
		const engine = createEngine({
			profiles: [PROFILE],
			knowledge: new FakeKnowledge([FOUND]),
			model: { id: "acme/small-model", apiKey: "test-key", baseURL: server.baseURL },
			screening: { model: false },
			onTiming: (t) => timings.push(t),
		});
		await collect(
			engine.guide("harbour-bikes").ask({ question: "How do I rent a bike?", locale: "en" }),
		);
		expect(timings).toHaveLength(1);
		const [t] = timings;
		expect(t?.outcome).toBe("reply");
		expect(t?.attempts).toHaveLength(1);
		expect(t?.attempts[0]?.rounds).toBe(2);
		expect(t?.tools.map((x) => [x.tool, x.passages])).toEqual([["searchKnowledge", 1]]);
		expect(t?.firstTextMs).not.toBeNull();
		expect(JSON.stringify(t)).not.toMatch(/rent|Bikes/);
	});
});
