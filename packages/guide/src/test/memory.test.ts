import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openMemory } from "@psi/engine";
import {
	chatBody,
	collect,
	type FakeOpenRouter,
	type FakeReply,
	messageText,
	shape,
	startFakeOpenRouter,
} from "@psi/engine/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGuide } from "../guide";
import { EVALUATION, FakeKnowledge, passage } from "./fake-knowledge";

const THREAD = "0b6f0c5e-7d0c-4c55-9c39-3f7d2b0a9e11";

let dir: string;
let fake: FakeOpenRouter | undefined;

beforeEach(() => {
	vi.stubEnv("OPENROUTER_API_KEY", "");
	dir = mkdtempSync(join(tmpdir(), "psi-guide-"));
});

afterEach(async () => {
	vi.unstubAllEnvs();
	await fake?.close();
	fake = undefined;
	rmSync(dir, { recursive: true, force: true });
});

const ANSWERS: ReadonlyArray<FakeReply> = [
	{ kind: "text", chunks: ["Evaluarea durează două ore [1]."] },
	{ kind: "text", chunks: ["Da, și părinții participă [1]."] },
];

async function setUp(replies: ReadonlyArray<FakeReply> = ANSWERS) {
	const server = await startFakeOpenRouter(replies);
	fake = server;
	const url = `file:${join(dir, "nested", "guide.db")}`;
	const guide = createGuide({
		brand: "psizone",
		knowledge: new FakeKnowledge([
			{
				kind: "passages",
				passages: [
					passage(EVALUATION, "Evaluarea durează două ore. Părinții participă la evaluare."),
				],
			},
		]),
		apiKey: "test-key",
		baseURL: server.baseURL,
		memory: { url },
		timeouts: { retrievalMs: 1_000, idleMs: 3_000, totalMs: 8_000 },
	});
	return { guide, server, url };
}

describe("memory", () => {
	it("stores nothing when no threadId is given", async () => {
		const { guide, url } = await setUp();
		const events = await collect(guide.ask({ question: "Cum decurge o evaluare?", locale: "ro" }));
		expect(shape(events)).toEqual(["thinking", "text", "sources", "done"]);
		const threads = await openMemory(url).listThreads({});
		expect(threads.threads).toHaveLength(0);
	});

	it("keeps a consented thread and reads it back on the next question", async () => {
		const { guide, server, url } = await setUp();
		await collect(
			guide.ask({ question: "Cum decurge o evaluare?", locale: "ro", threadId: THREAD }),
		);
		const second = await collect(
			guide.ask({ question: "Pot participa și eu?", locale: "ro", threadId: THREAD }),
		);
		expect(shape(second)).toEqual(["thinking", "text", "sources", "done"]);

		const sent = chatBody(server.requests[1]).messages.map(
			(m) => `${m.role}:${messageText(m.content)}`,
		);
		expect(sent).toContain("user:Cum decurge o evaluare?");
		expect(sent).toContain("assistant:Evaluarea durează două ore [1].");
		// After the question, this turn's own search: the model searched before answering.
		const asked = sent.lastIndexOf("user:Pot participa și eu?");
		expect(asked).toBeGreaterThan(sent.indexOf("assistant:Evaluarea durează două ore [1]."));
		expect(sent.slice(asked + 1).some((m) => m.startsWith("tool:"))).toBe(true);

		const memory = openMemory(url);
		const { threads } = await memory.listThreads({});
		expect(threads.map((t) => t.id)).toEqual([`psizone-${THREAD}`]);
		const { messages } = await memory.recall({
			threadId: `psizone-${THREAD}`,
			resourceId: "psi-guide-psizone",
		});
		expect(messages).toHaveLength(4);
		expect(JSON.stringify(messages)).not.toContain("<passages>");
	});

	it.each([
		[
			"regenerated for a sentence nothing supports",
			{ kind: "text", chunks: ["Lucrăm cu psihoterapie [1]. Încearcă Hemi-Sync."], delayMs: 30 },
		],
		["the provider failed twice", { kind: "status", status: 500 }],
	] as const)("removes a reply %s from the thread, keeping the question", async (_label, reply) => {
		const { guide, url } = await setUp([reply]);
		await collect(
			guide.ask({ question: "Ce faceți pentru anxietate?", locale: "ro", threadId: THREAD }),
		);
		// Let Mastra finish saving the run first, so the check below cannot pass before the save.
		await new Promise((resolve) => setTimeout(resolve, 1_000));
		const memory = openMemory(url);
		await vi.waitFor(
			async () => {
				const { messages } = await memory.recall({
					threadId: `psizone-${THREAD}`,
					resourceId: "psi-guide-psizone",
				});
				// The first (discarded) reply is gone; only the questions and at most the kept reply stay.
				const assistant = messages.filter((m) => m.role === "assistant");
				expect(assistant.length).toBeLessThanOrEqual(1);
				expect(JSON.stringify(assistant)).not.toMatch(/hemi/i);
			},
			{ timeout: 8_000, interval: 200 },
		);
	});
});
