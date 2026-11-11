import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGuide } from "../guide";
import { fileDirectory, openMemory } from "../memory";
import { EVALUATION, FakeKnowledge, passage } from "./fake-knowledge";
import { type FakeOpenRouter, type FakeReply, startFakeOpenRouter } from "./fake-openrouter";
import { chatBody, collect, messageText, shape } from "./helpers";

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
			{ kind: "passages", passages: [passage(EVALUATION, "Evaluarea durează două ore.")] },
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
		expect(sent[sent.length - 1]).toBe("user:Pot participa și eu?");

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
		["refused at the end of the answer", ["Lucrăm cu psihoterapie [1]. Încearcă Hemi-Sync."]],
		[
			"refused mid-answer (the run is aborted)",
			["Lucrăm cu psihoterapie [1]. ", "Încearcă Hemi-Sync. ", "Apoi ", "mai mult [1]."],
		],
		["the no-content sentinel", ["NO_CONTENT"]],
	])("removes an answer %s from the thread, keeping the question", async (_label, chunks) => {
		const { guide, url } = await setUp([{ kind: "text", chunks, delayMs: 30 }]);
		const events = await collect(
			guide.ask({ question: "Ce faceți pentru anxietate?", locale: "ro", threadId: THREAD }),
		);
		expect(events.some((event) => event.type === "refusal")).toBe(true);
		// Let Mastra finish saving the run first, so the check below cannot pass before the save.
		await new Promise((resolve) => setTimeout(resolve, 1_000));
		const memory = openMemory(url);
		await vi.waitFor(
			async () => {
				const { messages } = await memory.recall({
					threadId: `psizone-${THREAD}`,
					resourceId: "psi-guide-psizone",
				});
				expect(messages.map((m) => m.role)).toEqual(["user"]);
			},
			{ timeout: 8_000, interval: 200 },
		);
	});

	it("creates the directory of a file URL and leaves other URLs alone", () => {
		expect(fileDirectory("file:.data/guide.db")).toMatch(/\.data$/);
		expect(fileDirectory("file:///var/lib/psi/guide.db")).toBe("/var/lib/psi");
		expect(fileDirectory("libsql://psi.turso.io")).toBeUndefined();
		expect(fileDirectory(":memory:")).toBeUndefined();
	});
});
