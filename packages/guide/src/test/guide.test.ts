import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GuideFailure } from "../ask";
import type { Brand } from "../contract";
import { createGuide, type Guide } from "../guide";
import { DEFAULT_MODEL } from "../model";
import {
	ABA,
	EVALUATION,
	FakeKnowledge,
	passage,
	QEEG,
	type SearchBehaviour,
} from "./fake-knowledge";
import { type FakeOpenRouter, type FakeReply, startFakeOpenRouter } from "./fake-openrouter";
import { answerText, chatBody, collect, messageText, shape } from "./helpers";

const FOUND: SearchBehaviour = {
	kind: "passages",
	passages: [
		passage(EVALUATION, "Evaluarea durează două ore și include o discuție cu părinții."),
		passage(ABA, "Terapia ABA se lucrează individual, în ședințe de 50 de minute."),
		passage(QEEG, "Harta QEEG arată activitatea electrică a creierului."),
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
		expect(knowledge.calls).toEqual([
			{ query: "Cum decurge o evaluare?", brand: "psizone", locale: "ro", topK: 5 },
		]);

		const body = chatBody(server.requests[0]);
		expect(body.model).toBe(DEFAULT_MODEL);
		expect(body.provider?.data_collection).toBe("deny");
		expect(body.tool_choice).not.toBe("required");
		expect(body.tools?.map((tool) => tool.function.name)).toEqual(["searchKnowledge"]);
		const system = body.messages
			.filter((m) => m.role === "system")
			.map((m) => messageText(m.content))
			.join("\n");
		expect(system).toContain("ghidul Psizone");
		expect(system).toContain("[1] Cum decurge o evaluare");
		expect(system).toContain("<passages>");
	});

	it("answers in English with the English instructions", async () => {
		const { guide, server } = await guideWith(
			[{ kind: "text", chunks: ["The evaluation takes two hours [1]."] }],
			[FOUND],
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

	it("numbers passages from a follow-up searchKnowledge call with the rest", async () => {
		const extra = passage(
			{ ...EVALUATION, id: "pret", title: "Prețuri" },
			"Evaluarea costă 600 de lei.",
		);
		const { guide, knowledge } = await guideWith(
			[
				{ kind: "tool", query: "preț evaluare" },
				{ kind: "text", chunks: ["Evaluarea costă 600 de lei [4]."] },
			],
			[FOUND, { kind: "passages", passages: [extra] }],
		);
		const events = await collect(guide.ask({ question: "Cât costă evaluarea?", locale: "ro" }));
		expect(shape(events)).toEqual(["thinking", "text", "sources", "done"]);
		expect(answerText(events)).toBe("Evaluarea costă 600 de lei [1].");
		const sources = events.find((event) => event.type === "sources");
		expect(sources?.type === "sources" ? sources.sources.map((s) => s.id) : []).toEqual(["pret"]);
		expect(knowledge.calls.map((call) => call.query)).toEqual([
			"Cât costă evaluarea?",
			"preț evaluare",
		]);
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

	it("out_of_scope: a diagnosis request never reaches the model", async () => {
		const { guide, server, knowledge } = await guideWith(
			[{ kind: "text", chunks: ["x"] }],
			[FOUND],
		);
		const events = await collect(guide.ask({ question: "Copilul meu are ADHD?", locale: "ro" }));
		expect(shape(events)).toEqual(["refusal:out_of_scope", "done"]);
		expect(server.requests).toHaveLength(0);
		expect(knowledge.calls).toHaveLength(0);
	});

	it("no_content: empty retrieval refuses without calling the model", async () => {
		const { guide, server } = await guideWith(
			[{ kind: "text", chunks: ["x"] }],
			[{ kind: "passages", passages: [] }],
		);
		const events = await collect(guide.ask({ question: "Aveți parcare?", locale: "ro" }));
		expect(shape(events)).toEqual(["thinking", "refusal:no_content", "done"]);
		expect(server.requests).toHaveLength(0);
	});

	it("no_content: the model says the passages do not answer", async () => {
		const { guide } = await guideWith([{ kind: "text", chunks: ["NO_", "CONTENT"] }], [FOUND]);
		const events = await collect(guide.ask({ question: "Aveți parcare?", locale: "ro" }));
		expect(shape(events)).toEqual(["thinking", "refusal:no_content", "done"]);
	});

	it("no_content: a percentage the passages do not hold stops the answer", async () => {
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
		expect(shape(events)).toEqual(["thinking", "text", "refusal:no_content", "done"]);
		expect(answerText(events)).not.toContain("86");
	});

	it("no_content: an answer that cites no passage is not grounded", async () => {
		const { guide } = await guideWith(
			[{ kind: "text", chunks: ["Evaluarea durează două ore."] }],
			[FOUND],
		);
		const events = await collect(guide.ask({ question: "Cum decurge o evaluare?", locale: "ro" }));
		expect(shape(events)).toEqual(["thinking", "text", "refusal:no_content", "done"]);
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

	it("out_of_scope: Psizone naming Hemi-Sync on a clinical question is stopped", async () => {
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
			[FOUND],
		);
		const events = await collect(
			guide.ask({ question: "Ce faceți pentru anxietate?", locale: "ro" }),
		);
		expect(shape(events)).toEqual(["thinking", "text", "refusal:out_of_scope", "done"]);
		expect(answerText(events)).not.toMatch(/hemi/i);
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
		expect(server.requests).toHaveLength(1);
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

	it("unavailable: the knowledge base throws", async () => {
		const { guide } = await guideWith([{ kind: "text", chunks: ["x"] }], [{ kind: "throw" }]);
		const events = await collect(guide.ask({ question: "Cum decurge o evaluare?", locale: "ro" }));
		expect(shape(events)).toEqual(["thinking", "refusal:unavailable", "done"]);
	});

	it("unavailable: the knowledge base never answers (retrieval timeout)", async () => {
		const { guide, server } = await guideWith(
			[{ kind: "text", chunks: ["x"] }],
			[{ kind: "hang" }],
		);
		const events = await collect(guide.ask({ question: "Cum decurge o evaluare?", locale: "ro" }));
		expect(shape(events)).toEqual(["thinking", "refusal:unavailable", "done"]);
		expect(server.requests).toHaveLength(0);
	});

	it("stops the model call when the caller stops reading", async () => {
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
		const seen: Array<string> = [];
		for await (const event of guide.ask({ question: "Cum decurge o evaluare?", locale: "ro" })) {
			seen.push(event.type);
			if (event.type === "text") break;
		}
		expect(seen).toEqual(["thinking", "text"]);
		expect(server.requests).toHaveLength(1);
		await vi.waitFor(() => expect(server.cutOff()).toBe(1));
	});

	it("unavailable: the caller aborts", async () => {
		const { guide } = await guideWith([{ kind: "hang" }], [FOUND]);
		const control = new AbortController();
		setTimeout(() => control.abort(), 50);
		const events = await collect(
			guide.ask({ question: "Cum decurge o evaluare?", locale: "ro" }, { signal: control.signal }),
		);
		expect(shape(events)).toEqual(["thinking", "refusal:unavailable", "done"]);
	});
});
