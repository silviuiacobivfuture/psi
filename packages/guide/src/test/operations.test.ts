import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createKnowledge, createLexicalEmbedder, type KnowledgeStore, SEED } from "@psi/knowledge";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGuide } from "../index";

let dir: string;
let kb: KnowledgeStore;

beforeEach(() => {
	vi.stubEnv("OPENROUTER_API_KEY", "");
	vi.stubEnv("CHROMA_URL", "");
	vi.stubEnv("PSI_DEMO_KNOWLEDGE", "");
	dir = mkdtempSync(join(tmpdir(), "psi-ops-"));
	kb = createKnowledge({ url: `file:${join(dir, "kb.db")}`, embedder: createLexicalEmbedder() });
});
afterEach(async () => {
	vi.unstubAllEnvs();
	await kb.close();
	rmSync(dir, { recursive: true, force: true });
});

describe("the guide's control-plane operations", () => {
	it("describe the brand's Mastra agent: its voice, model, tools and workflows", async () => {
		const ops = createGuide({ brand: "hemisync", knowledge: kb }).operations;
		if (ops === undefined) throw new Error("createGuide gives operations");
		const a = await ops.agent();
		expect(a.id).toContain("hemisync");
		expect(a.hasKey).toBe(false);
		expect(a.instructions.length).toBeGreaterThan(100);
		expect([...a.locales].sort()).toEqual(["en", "ro"]);
		expect(a.tools.length).toBeGreaterThan(0);
		expect(a.workflows).toContain("ingestKnowledge");
	});
	it("rebuild through the ingestKnowledge workflow, and the index counts follow", async () => {
		const ops = createGuide({ brand: "eqsync", knowledge: kb }).operations;
		if (ops?.knowledge == null) throw new Error("a store gives knowledge facts");
		expect(await ops.knowledge.indexStats()).toEqual([]);
		const entries = SEED.filter((e) => e.brand === "eqsync");
		const out = await ops.ingest(entries);
		if (!out.ok) throw new Error(out.reason);
		expect(out.runId).not.toBe("");
		expect(out.report.indexed).toHaveLength(entries.length);
		const stats = await ops.knowledge.indexStats();
		expect(stats.reduce((n, s) => n + s.chunks, 0)).toBe(out.report.chunks);
		expect(ops.knowledge.embedder.kind).toBe("lexical");
	});
	it("refuses an entry the knowledge base would not accept, ingesting nothing", async () => {
		const ops = createGuide({ brand: "eqsync", knowledge: kb }).operations;
		const out = await ops?.ingest([{ id: "x" }]);
		expect(out?.ok).toBe(false);
		expect(await ops?.knowledge?.indexStats()).toEqual([]);
	});
});
