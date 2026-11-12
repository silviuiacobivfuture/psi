import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	answerText,
	collect,
	type FakeOpenRouter,
	shape,
	startFakeOpenRouter,
} from "@psi/engine/testing";
import {
	createKnowledge,
	createLexicalEmbedder,
	type Embedder,
	type KnowledgeStore,
	SEED,
} from "@psi/knowledge";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPsiEngine, type GuideFailure } from "../index";

let dir: string;
let fake: FakeOpenRouter | undefined;
beforeEach(() => {
	vi.stubEnv("OPENROUTER_API_KEY", "");
	vi.stubEnv("CHROMA_URL", "");
	vi.stubEnv("PSI_GUIDE_SETTINGS", "");
	dir = mkdtempSync(join(tmpdir(), "psi-tiers-"));
});
afterEach(async () => {
	vi.unstubAllEnvs();
	await fake?.close();
	fake = undefined;
	rmSync(dir, { recursive: true, force: true });
});

/** The lexical embedder's space with a provider that is down: the indexes exist, embedding fails. */
function down(): Embedder {
	const lexical = createLexicalEmbedder();
	return { ...lexical, embed: async () => Promise.reject(new Error("embeddings provider down")) };
}

describe("retrieval tiers in psi's guides", () => {
	it("answers from the lexical tier, cited, when embeddings are down, and reports the degradation", async () => {
		const url = `file:${join(dir, "kb.db")}`;
		const writer = createKnowledge({ url, embedder: createLexicalEmbedder() });
		await writer.ingest(SEED);
		await writer.close();
		const store: KnowledgeStore = createKnowledge({ url, embedder: down() });
		fake = await startFakeOpenRouter([
			{ kind: "text", chunks: ["Poți suna direct la centrul Psizone, la 0748 017 752 [1]."] },
		]);
		const failures: Array<GuideFailure> = [];
		const engine = createPsiEngine({
			knowledge: store,
			apiKey: "test-key",
			baseURL: fake.baseURL,
			onFailure: (f) => failures.push({ stage: f.stage, error: f.error }),
		});
		const events = await collect(
			engine.guide("psizone").ask({ question: "La ce telefon vă pot suna?", locale: "ro" }),
		);
		expect(shape(events)).toEqual(["thinking", "text", "sources", "done"]);
		expect(answerText(events)).toContain("0748 017 752 [1]");
		expect(failures.map((f) => f.stage)).toContain("embeddings_degraded");
		expect(JSON.stringify(failures)).not.toContain("telefon");
		const tools = Object.keys(await engine.guide("psizone").agent.listTools()).sort();
		expect(tools).toEqual([
			"contactDetails",
			"findPage",
			"getEntry",
			"listTopics",
			"searchKnowledge",
			"servicesList",
		]);
		await store.close();
	});
});
