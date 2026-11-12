import { ANSWER_TEMPERATURE, MAX_PROMPT_TOKENS } from "@psi/engine";
import {
	answerText,
	chatBody,
	collect,
	type FakeOpenRouter,
	messageText,
	shape,
} from "@psi/engine/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { EVALUATION, passage } from "./fake-knowledge";
import { closeAll, FOUND_EN, FOUND_RO, startGuide } from "./harness";

beforeEach(() => {
	vi.stubEnv("OPENROUTER_API_KEY", "");
	vi.stubEnv("PSI_GUIDE_MODEL", "");
});

afterEach(async () => {
	vi.unstubAllEnvs();
	await closeAll();
});

function systemText(server: FakeOpenRouter): string {
	return chatBody(server.requests[0])
		.messages.filter((m) => m.role === "system")
		.map((m) => messageText(m.content))
		.join("\n");
}

describe("the configured language comes first", () => {
	it.each([
		["Romanian", "Cum arată o evaluare pentru autism?", ""],
		["Romanian without diacritics", "cum arata o evaluare pentru autism", ""],
		["English", "How does an evaluation for autism work?", "Vizitatorul a scris în engleză"],
		["mixed", "Bună ziua, what is the price pentru evaluare?", "Vizitatorul a amestecat"],
	])("a %s question on a Romanian site is searched and answered in Romanian", async (_label, question, note) => {
		const { guide, server, knowledge } = await startGuide();
		const events = await collect(guide.ask({ question, locale: "ro" }));
		expect(shape(events)).toEqual(["thinking", "text", "sources", "done"]);
		expect(knowledge.calls[0]?.locale).toBe("ro");
		const system = systemText(server);
		expect(system.startsWith("Limba conversației este româna.")).toBe(true);
		if (note === "") expect(system).not.toContain("Vizitatorul a");
		else expect(system).toContain(note);
	});

	it("a Romanian question on an English site is searched and answered in English", async () => {
		const { guide, server, knowledge } = await startGuide({
			replies: [{ kind: "text", chunks: ["The evaluation takes two hours [1]."] }],
			searches: [FOUND_EN],
		});
		const events = await collect(
			guide.ask({ question: "Cum arată o evaluare pentru autism?", locale: "en" }),
		);
		expect(shape(events)).toEqual(["thinking", "text", "sources", "done"]);
		expect(knowledge.calls[0]?.locale).toBe("en");
		const system = systemText(server);
		expect(system.startsWith("The language of this conversation is English.")).toBe(true);
		expect(system).toContain("The visitor wrote in Romanian. Answer only in English anyway");
	});

	it("the follow-up search is asked for in the configured language", async () => {
		const { guide, server } = await startGuide();
		await collect(guide.ask({ question: "How does an evaluation work?", locale: "ro" }));
		const ToolsSchema = z.object({
			tools: z.array(
				z.object({
					function: z.object({
						parameters: z.object({
							properties: z.object({ query: z.object({ description: z.string() }) }),
						}),
					}),
				}),
			),
		});
		const tools = ToolsSchema.parse(server.requests[0]?.body).tools;
		expect(tools[0]?.function.parameters.properties.query.description).toContain("Romanian");
	});

	it("an answer still in the other language after its retry: the canned line, never unavailable", async () => {
		const { guide, failures } = await startGuide({
			replies: [{ kind: "text", chunks: ["The evaluation takes two hours [1]."] }],
			searches: [FOUND_EN],
		});
		const events = await collect(guide.ask({ question: "Cum decurge o evaluare?", locale: "ro" }));
		expect(shape(events).slice(-2)).toEqual(["replace", "done"]);
		expect(answerText(events)).not.toContain("two hours");
		expect(failures).toEqual([
			{ stage: "check", error: "Error: regenerated: another language" },
			{ stage: "model", error: "Error: reply not in the configured language after a retry" },
		]);
	});
});

describe("accuracy", () => {
	it("asks the model for a moderate temperature (varied conversation; facts come from the tools)", async () => {
		const { guide, server } = await startGuide();
		await collect(guide.ask({ question: "Cum decurge o evaluare?", locale: "ro" }));
		const body = z.object({ temperature: z.number() }).parse(server.requests[0]?.body);
		expect(body.temperature).toBe(ANSWER_TEMPERATURE);
		expect(ANSWER_TEMPERATURE).toBeLessThanOrEqual(0.6);
	});

	it("reports the score of a faithful answer through onScore, with no visitor content", async () => {
		const { guide, scores } = await startGuide({
			replies: [
				{
					kind: "text",
					chunks: ["Evaluarea durează două ore [1]. ", "Te așteptăm la o programare."],
				},
			],
		});
		const events = await collect(
			guide.ask({ question: "Cum decurge evaluarea SECRETQ?", locale: "ro" }),
		);
		expect(shape(events)).toEqual(["thinking", "text", "sources", "done"]);
		expect(scores).toEqual([
			{ scorer: "psi-faithfulness", score: 1, claims: 1, supported: 1, passed: true, dropped: 0 },
		]);
		expect(JSON.stringify(scores)).not.toContain("SECRETQ");
	});

	it.each([
		["a figure the passages lack", "Evaluarea durează 3 ore [1].", "3 ore"],
		["an effect the passages do not state", "Terapia ABA vindecă autismul complet [2].", "vindecă"],
	])("%s: regenerated once, then replaced by the honest line", async (_label, answer, invented) => {
		const { guide, server } = await startGuide({ replies: [{ kind: "text", chunks: [answer] }] });
		const events = await collect(guide.ask({ question: "Cum decurge o evaluare?", locale: "ro" }));
		expect(shape(events).slice(-2)).toEqual(["replace", "done"]);
		expect(answerText(events)).not.toContain(invented);
		expect(answerText(events)).toContain("Nu am găsit asta în paginile noastre");
		expect(server.requests).toHaveLength(2);
	});

	it("a citation to a passage it was never shown is dropped", async () => {
		const { guide } = await startGuide({
			replies: [{ kind: "text", chunks: ["Evaluarea durează două ore [9]."] }],
		});
		const events = await collect(guide.ask({ question: "Cum decurge o evaluare?", locale: "ro" }));
		expect(answerText(events)).toBe("Evaluarea durează două ore.");
		expect(events.some((event) => event.type === "sources")).toBe(false);
	});

	it("an unsupported effect after a supported sentence: that sentence is left out", async () => {
		const { guide } = await startGuide({
			replies: [
				{
					kind: "text",
					chunks: [
						"Evaluarea durează două ore [1]. ",
						"Harta QEEG tratează insomnia la adulți [3].",
					],
				},
			],
		});
		const events = await collect(guide.ask({ question: "Cum decurge o evaluare?", locale: "ro" }));
		// Streamed, reset for the regeneration, then corrected: the final text is what stays.
		expect(shape(events).slice(-3)).toEqual(["replace", "sources", "done"]);
		expect(answerText(events)).toBe("Evaluarea durează două ore [1].");
	});

	it("keeps a warm sentence that states no figure or clinical fact", async () => {
		const { guide, scores } = await startGuide({
			replies: [
				{
					kind: "text",
					chunks: [
						"Evaluarea durează două ore [1]. ",
						"Echipa noastră lucrează cu multă răbdare și atenție [1]. ",
						"Te așteptăm la o programare.",
					],
				},
			],
		});
		const events = await collect(guide.ask({ question: "Cum decurge o evaluare?", locale: "ro" }));
		expect(shape(events)).toEqual(["thinking", "text", "sources", "done"]);
		expect(answerText(events)).toBe(
			"Evaluarea durează două ore [1]. Echipa noastră lucrează cu multă răbdare și atenție [1]. Te așteptăm la o programare.",
		);
		expect(scores).toHaveLength(1);
	});

	it("an abbreviation mid-sentence does not cut the sentence before its citation", async () => {
		const { guide } = await startGuide({
			replies: [
				{ kind: "text", chunks: ["Evaluarea o face dr. ", "Ana Popescu, cu părinții [1]."] },
			],
			searches: [
				{
					kind: "passages",
					passages: [
						passage(EVALUATION, "Evaluarea o face dr. Ana Popescu, împreună cu părinții."),
					],
				},
			],
		});
		const events = await collect(guide.ask({ question: "Cine face evaluarea?", locale: "ro" }));
		expect(shape(events)).toEqual(["thinking", "text", "sources", "done"]);
	});

	it("an English answer that names Romanian places stays an English answer", async () => {
		const { guide } = await startGuide({
			replies: [{ kind: "text", chunks: ["The evaluation takes two hours in Galați [1]."] }],
			searches: [
				{
					kind: "passages",
					passages: [
						passage(EVALUATION, "The evaluation takes two hours, at our centre in Galați."),
					],
				},
			],
		});
		const events = await collect(
			guide.ask({ question: "How long is the evaluation?", locale: "en" }),
		);
		expect(shape(events)).toEqual(["thinking", "text", "sources", "done"]);
	});

	it("reports an answer that makes no claim as failing the Mastra scorer", async () => {
		const { guide, scores } = await startGuide({
			replies: [{ kind: "text", chunks: ["Da [1]."] }],
		});
		await collect(guide.ask({ question: "Pot veni?", locale: "ro" }));
		expect(scores).toEqual([
			{ scorer: "psi-faithfulness", score: 0, claims: 0, supported: 0, passed: false, dropped: 0 },
		]);
	});

	it("does not score a conversational reply that cites nothing", async () => {
		const { guide, scores } = await startGuide({
			replies: [{ kind: "text", chunks: ["Bună, cu ce te pot ajuta?"] }],
		});
		await collect(guide.ask({ question: "salut", locale: "ro" }));
		expect(scores).toHaveLength(0);
	});

	it("keeps a long history inside the prompt budget (Mastra TokenLimiterProcessor)", async () => {
		const { guide, server } = await startGuide({ searches: [FOUND_RO] });
		const history = Array.from({ length: 20 }, (_, i) => ({
			role: i % 2 === 0 ? ("user" as const) : ("guide" as const),
			text: `Mesajul ${i} despre program. ${"Detalii despre program și evaluare. ".repeat(100)}`,
		}));
		const events = await collect(
			guide.ask({ question: "Cum decurge o evaluare?", locale: "ro", history }),
		);
		expect(shape(events)).toEqual(["thinking", "text", "sources", "done"]);
		// The first model request, before its search: the history and the question.
		const sent = chatBody(server.searches[0]).messages.filter((m) => m.role !== "system");
		expect(sent.length).toBeLessThan(history.length + 1);
		expect(messageText(sent[sent.length - 1]?.content)).toBe("Cum decurge o evaluare?");
		expect(JSON.stringify(sent).length / 4).toBeLessThan(MAX_PROMPT_TOKENS);
	});
});
