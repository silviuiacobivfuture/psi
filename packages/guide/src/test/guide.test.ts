import {
	answerText,
	chatBody,
	collect,
	type FakeOpenRouter,
	type FakeReply,
	messageText,
	shape,
	startFakeOpenRouter,
} from "@psi/engine/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Brand } from "../contract";
import { createGuide, type Guide, type GuideFailure } from "../guide";
import { DEFAULT_MODEL } from "../model";
import {
	ABA,
	EVALUATION,
	FakeKnowledge,
	passage,
	QEEG,
	type SearchBehaviour,
} from "./fake-knowledge";

const FOUND: SearchBehaviour = {
	kind: "passages",
	passages: [
		passage(EVALUATION, "Evaluarea durează două ore și include o discuție cu părinții."),
		passage(ABA, "Terapia ABA se lucrează individual, în ședințe de 50 de minute."),
		passage(QEEG, "Harta QEEG arată activitatea electrică a creierului."),
	],
};

/** English content for English answers: faithfulness compares an answer's wording with its passages. */
const FOUND_EN: SearchBehaviour = {
	kind: "passages",
	passages: [
		passage(EVALUATION, "The evaluation takes two hours and includes a talk with the parents."),
	],
};

let fake: FakeOpenRouter | undefined;

async function guideWith(
	replies: ReadonlyArray<FakeReply>,
	searches: ReadonlyArray<SearchBehaviour>,
	brand: Brand = "psizone",
): Promise<{
	guide: Guide;
	knowledge: FakeKnowledge;
	server: FakeOpenRouter;
	failures: Array<GuideFailure>;
}> {
	const server = await startFakeOpenRouter(replies);
	fake = server;
	const knowledge = new FakeKnowledge(searches);
	const failures: Array<GuideFailure> = [];
	const guide = createGuide({
		brand,
		knowledge,
		apiKey: "test-key",
		baseURL: server.baseURL,
		timeouts: { retrievalMs: 300, idleMs: 500, totalMs: 3_000 },
		onFailure: (failure) => failures.push(failure),
	});
	return { guide, knowledge, server, failures };
}

beforeEach(() => {
	vi.stubEnv("OPENROUTER_API_KEY", "");
	vi.stubEnv("PSI_GUIDE_MODEL", "");
});

afterEach(async () => {
	vi.unstubAllEnvs();
	await fake?.close();
	fake = undefined;
});

describe("a grounded answer", () => {
	it("streams thinking, text, sources, done, citing only the passages it used", async () => {
		const { guide, server, knowledge } = await guideWith(
			[
				{
					kind: "text",
					chunks: ["Evaluarea durează ", "două ore [1]. Lucrăm ", "individual [2, 1].\n"],
				},
			],
			[FOUND],
		);
		const events = await collect(guide.ask({ question: "Cum decurge o evaluare?", locale: "ro" }));

		expect(shape(events)).toEqual(["thinking", "text", "sources", "done"]);
		expect(answerText(events)).toBe("Evaluarea durează două ore [1]. Lucrăm individual [2][1].\n");
		const sources = events.find((event) => event.type === "sources");
		expect(sources?.type === "sources" ? sources.sources.map((s) => s.id) : []).toEqual([
			"evaluare",
			"aba",
		]);
		// Only the agent's own search (no probe); with the demo off it asks for three times the
		// topK, so demo twins never crowd it.
		expect(knowledge.calls).toEqual([
			{ query: "Cum decurge o evaluare?", brand: "psizone", locale: "ro", topK: 15 },
		]);

		const body = chatBody(server.requests[0]);
		expect(body.model).toBe(DEFAULT_MODEL);
		expect(body.provider?.data_collection).toBe("deny");
		expect(body.tool_choice).not.toBe("required");
		expect(body.tools?.map((tool) => tool.function.name).sort()).toEqual([
			"findArticles",
			"searchKnowledge",
		]);
		const system = body.messages
			.filter((m) => m.role === "system")
			.map((m) => messageText(m.content))
			.join("\n");
		expect(system).toContain("ghidul Psizone");
		// No passage in the prompt: the passages reach the model only as the tool's result.
		expect(system).not.toContain("<passages>");
		expect(system).not.toContain("include o discuție cu părinții");
		expect(JSON.stringify(body.messages.filter((m) => m.role === "tool"))).toContain(
			"include o discuție cu părinții",
		);
	});

	it("answers in English with the English instructions", async () => {
		const { guide, server } = await guideWith(
			[{ kind: "text", chunks: ["The evaluation takes two hours [1]."] }],
			[FOUND_EN],
		);
		const events = await collect(
			guide.ask({ question: "How does an evaluation work?", locale: "en" }),
		);
		expect(shape(events)).toEqual(["thinking", "text", "sources", "done"]);
		const system = chatBody(server.requests[0])
			.messages.filter((m) => m.role === "system")
			.map((m) => messageText(m.content))
			.join("\n");
		expect(system).toContain("the Psizone guide");
	});

	it("cites only the passages a tool returned", async () => {
		const extra = passage(
			{ ...EVALUATION, id: "pret", title: "Prețuri" },
			"Evaluarea costă 600 de lei.",
		);
		const { guide, knowledge } = await guideWith(
			[
				{ kind: "tool", query: "preț evaluare" },
				{ kind: "text", chunks: ["Evaluarea costă 600 de lei [1]."] },
			],
			[{ kind: "passages", passages: [extra] }],
		);
		const events = await collect(guide.ask({ question: "Cât costă evaluarea?", locale: "ro" }));
		expect(shape(events)).toEqual(["thinking", "text", "sources", "done"]);
		expect(answerText(events)).toBe("Evaluarea costă 600 de lei [1].");
		const sources = events.find((event) => event.type === "sources");
		expect(sources?.type === "sources" ? sources.sources.map((s) => s.id) : []).toEqual(["pret"]);
		expect(knowledge.calls.map((call) => call.query)).toEqual(["preț evaluare"]);
	});

	it("uses PSI_GUIDE_MODEL when no model option is given", async () => {
		vi.stubEnv("PSI_GUIDE_MODEL", "anthropic/claude-opus-5.5");
		const { guide, server } = await guideWith([{ kind: "text", chunks: ["Da [1]."] }], [FOUND]);
		expect(guide.model).toBe("anthropic/claude-opus-5.5");
		await collect(guide.ask({ question: "Cum decurge o evaluare?", locale: "ro" }));
		expect(chatBody(server.requests[0]).model).toBe("anthropic/claude-opus-5.5");
	});
});

describe("refusals", () => {
	it("crisis: refuses at once and sends nothing to the knowledge base or the model", async () => {
		const { guide, server, knowledge } = await guideWith(
			[{ kind: "text", chunks: ["x"] }],
			[FOUND],
		);
		const events = await collect(guide.ask({ question: "Nu mai vreau să trăiesc", locale: "ro" }));
		expect(shape(events)).toEqual(["refusal:crisis", "done"]);
		expect(server.requests).toHaveLength(0);
		expect(knowledge.calls).toHaveLength(0);
	});

	it("crisis wins over a missing API key", async () => {
		const guide = createGuide({ brand: "psizone", knowledge: new FakeKnowledge([FOUND]) });
		const events = await collect(guide.ask({ question: "I want to kill myself", locale: "en" }));
		expect(shape(events)).toEqual(["refusal:crisis", "done"]);
	});

	it("a diagnosis request: no refusal card, the agent steers it to a specialist", async () => {
		const steer =
			"Înțeleg grija ta. Asta se lămurește într-o evaluare cu un specialist; vrei să-ți spun cum faci o programare?";
		const { guide, server } = await guideWith([{ kind: "text", chunks: [steer] }], [FOUND]);
		const events = await collect(guide.ask({ question: "Copilul meu are ADHD?", locale: "ro" }));
		expect(shape(events)).toEqual(["thinking", "text", "done"]);
		expect(answerText(events)).toBe(steer);
		const system = chatBody(server.requests[0])
			.messages.filter((m) => m.role === "system")
			.map((m) => messageText(m.content))
			.join("\n");
		expect(system).toContain("Întrebarea cere un diagnostic");
	});

	it("a question nothing covers: an honest reply in conversation, never no_content", async () => {
		const honest = "Nu avem asta pe site; colegii îți răspund din pagina de contact.";
		const { guide } = await guideWith(
			[{ kind: "text", chunks: [honest] }],
			[{ kind: "passages", passages: [] }],
		);
		const events = await collect(guide.ask({ question: "Aveți parcare?", locale: "ro" }));
		expect(shape(events)).toEqual(["thinking", "text", "done"]);
		expect(answerText(events)).toBe(honest);
	});

	it("a percentage the passages do not hold is regenerated, then left out", async () => {
		const { guide } = await guideWith(
			[
				{
					kind: "text",
					chunks: ["Evaluarea durează două ore [1]. ", "Ajută 86% dintre copii [2]."],
				},
			],
			[FOUND],
		);
		const events = await collect(guide.ask({ question: "Cum decurge o evaluare?", locale: "ro" }));
		// Streamed, reset for the regeneration, then corrected: the final text is what stays.
		expect(shape(events).slice(-3)).toEqual(["replace", "sources", "done"]);
		expect(answerText(events)).toBe("Evaluarea durează două ore [1].");
	});

	it("an answer that cites no passage goes out without sources", async () => {
		const { guide } = await guideWith(
			[{ kind: "text", chunks: ["Evaluarea durează două ore."] }],
			[FOUND],
		);
		const events = await collect(guide.ask({ question: "Cum decurge o evaluare?", locale: "ro" }));
		expect(shape(events)).toEqual(["thinking", "text", "done"]);
	});

	it("unavailable: the answer was cut off before the model finished", async () => {
		const { guide, failures } = await guideWith(
			[{ kind: "text", chunks: ["Evaluarea durează două ore [1]. Apoi"], finish: "length" }],
			[FOUND],
		);
		const events = await collect(guide.ask({ question: "Cum decurge o evaluare?", locale: "ro" }));
		expect(events.some((event) => event.type === "sources")).toBe(false);
		expect(shape(events).slice(-2)).toEqual(["refusal:unavailable", "done"]);
		expect(failures[0]?.error).toContain("length");
	});

	it("Psizone naming Hemi-Sync on a clinical question: that sentence is left out", async () => {
		const { guide } = await guideWith(
			[
				{
					kind: "text",
					chunks: [
						"Pentru anxietate lucrăm cu psihoterapie [1]. ",
						"Poți încerca și Hemi-",
						"Sync.",
					],
				},
			],
			[
				{
					kind: "passages",
					passages: [
						passage(
							{ ...EVALUATION, id: "anxietate", title: "Anxietatea" },
							"Pentru anxietate lucrăm cu psihoterapie.",
						),
					],
				},
			],
		);
		const events = await collect(
			guide.ask({ question: "Ce faceți pentru anxietate?", locale: "ro" }),
		);
		// Streamed, reset for the regeneration, then corrected: the final text is what stays.
		expect(shape(events).slice(-3)).toEqual(["replace", "sources", "done"]);
		expect(answerText(events)).toBe("Pentru anxietate lucrăm cu psihoterapie [1].");
	});

	it("unavailable: no API key, without touching the knowledge base", async () => {
		const knowledge = new FakeKnowledge([FOUND]);
		const guide = createGuide({ brand: "psizone", knowledge });
		const events = await collect(guide.ask({ question: "Cum decurge o evaluare?", locale: "ro" }));
		expect(shape(events)).toEqual(["refusal:unavailable", "done"]);
		expect(knowledge.calls).toHaveLength(0);
	});

	it("unavailable: the provider fails", async () => {
		const { guide, server, failures } = await guideWith([{ kind: "status", status: 500 }], [FOUND]);
		const events = await collect(guide.ask({ question: "Cum decurge o evaluare?", locale: "ro" }));
		expect(shape(events)).toEqual(["thinking", "refusal:unavailable", "done"]);
		// Unavailable only after one retry.
		expect(server.requests).toHaveLength(2);
		expect(failures).toHaveLength(1);
		expect(failures[0]?.stage).toBe("model");
		expect(JSON.stringify(failures)).not.toContain("evaluare");
	});

	it("unavailable: the provider never answers (idle timeout)", async () => {
		const { guide } = await guideWith([{ kind: "hang" }], [FOUND]);
		const started = Date.now();
		const events = await collect(guide.ask({ question: "Cum decurge o evaluare?", locale: "ro" }));
		expect(shape(events)).toEqual(["thinking", "refusal:unavailable", "done"]);
		expect(Date.now() - started).toBeLessThan(2_500);
	});

	it.each([
		["throws", { kind: "throw" }],
		["never answers (retrieval timeout)", { kind: "hang" }],
	] as const)("the knowledge base %s: the agent still replies, never unavailable", async (_what, search) => {
		const sorry = "Nu pot căuta acum în pagini; colegii îți răspund din pagina de contact.";
		const { guide } = await guideWith([{ kind: "text", chunks: [sorry] }], [search]);
		const events = await collect(guide.ask({ question: "Cum decurge o evaluare?", locale: "ro" }));
		expect(shape(events)).toEqual(["thinking", "text", "done"]);
	});

	it("stops the model call when the caller aborts mid-reply", async () => {
		const { guide, server } = await guideWith(
			[
				{
					kind: "text",
					chunks: ["Evaluarea durează două ore [1]. ", "Apoi discutăm [1]. ", "La final [1]."],
					delayMs: 150,
				},
			],
			[FOUND],
		);
		const control = new AbortController();
		setTimeout(() => control.abort(), 200);
		const events = await collect(
			guide.ask({ question: "Cum decurge o evaluare?", locale: "ro" }, { signal: control.signal }),
		);
		// What streamed before the abort is never finished: no sources, no refusal, `done` alone.
		expect(shape(events)).toEqual(["thinking", "text", "done"]);
		expect(server.requests).toHaveLength(1);
		await vi.waitFor(() => expect(server.cutOff()).toBe(1));
	});

	it("an aborted turn renders nothing: done alone, never unavailable", async () => {
		const { guide } = await guideWith([{ kind: "hang" }], [FOUND]);
		const control = new AbortController();
		setTimeout(() => control.abort(), 50);
		const events = await collect(
			guide.ask({ question: "Cum decurge o evaluare?", locale: "ro" }, { signal: control.signal }),
		);
		expect(shape(events)).toEqual(["thinking", "done"]);
	});
});
