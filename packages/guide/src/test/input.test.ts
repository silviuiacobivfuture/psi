import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AskInputSchema, MAX_QUESTION_LENGTH } from "../events";
import { createGuide, type Guide } from "../guide";
import { EVALUATION, FakeKnowledge, passage } from "./fake-knowledge";
import { collect, shape } from "./helpers";

/**
 * `ask` takes input from apps that may not be type-checked; the spread lets these calls pass
 * runtime values the static type would reject, without a cast.
 */
function askUnchecked(guide: Guide, input: object): ReturnType<Guide["ask"]> {
	return guide.ask({ question: "", locale: "ro", ...input });
}

let knowledge: FakeKnowledge;
let guide: Guide;

beforeEach(() => {
	vi.stubEnv("OPENROUTER_API_KEY", "");
	vi.stubEnv("PSI_GUIDE_MODEL", "");
	knowledge = new FakeKnowledge([
		{ kind: "passages", passages: [passage(EVALUATION, "Evaluarea durează două ore.")] },
	]);
	guide = createGuide({
		brand: "psizone",
		knowledge,
		apiKey: "test-key",
		baseURL: "http://127.0.0.1:9/api/v1",
	});
});

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("input validation", () => {
	it.each([
		["an empty question", { question: "   ", locale: "ro" }],
		["a question over the limit", { question: "a".repeat(MAX_QUESTION_LENGTH + 1), locale: "ro" }],
		["an unknown locale", { question: "Cum decurge o evaluare?", locale: "fr" }],
		[
			"a guessable threadId",
			{ question: "Cum decurge o evaluare?", locale: "ro", threadId: "abc" },
		],
		["an unknown field", { question: "Cum decurge o evaluare?", locale: "ro", userId: "u1" }],
		[
			"too much history",
			{
				question: "Cum decurge o evaluare?",
				locale: "ro",
				history: Array.from({ length: 21 }, () => ({ role: "user", text: "x" })),
			},
		],
	])("refuses %s as out_of_scope without searching", async (_label, input) => {
		const events = await collect(askUnchecked(guide, input));
		expect(shape(events)).toEqual(["refusal:out_of_scope", "done"]);
		expect(knowledge.calls).toHaveLength(0);
	});

	it("an over-long message with crisis language gets the crisis refusal, not a length refusal", async () => {
		const events = await collect(
			askUnchecked(guide, { question: `Vreau să mor. ${"a".repeat(2000)}`, locale: "ro" }),
		);
		expect(shape(events)).toEqual(["refusal:crisis", "done"]);
	});

	it("accepts a well-formed question with history and trims it", () => {
		const parsed = AskInputSchema.parse({
			question: "  Cum decurge o evaluare?  ",
			locale: "ro",
			history: [
				{ role: "user", text: "Bună ziua" },
				{ role: "guide", text: "Bună ziua, cu ce te ajutăm?" },
			],
			threadId: "0b6f0c5e-7d0c-4c55-9c39-3f7d2b0a9e11",
		});
		expect(parsed.question).toBe("Cum decurge o evaluare?");
	});

	it("rejects bad options at construction", () => {
		expect(() => createGuide({ brand: "psizone", knowledge, model: "not a slug" })).toThrow();
	});

	it("ignores a malformed PSI_GUIDE_MODEL", () => {
		vi.stubEnv("PSI_GUIDE_MODEL", "not a slug");
		expect(createGuide({ brand: "psizone", knowledge }).model).toBe("anthropic/claude-sonnet-5.5");
	});
});
