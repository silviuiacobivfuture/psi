import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createKnowledge, createLexicalEmbedder, type KnowledgeStore } from "@psi/knowledge";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createPsiEngine, PSI_PROFILES } from "../index";

let dir: string;
let kb: KnowledgeStore;

beforeEach(() => {
	vi.stubEnv("OPENROUTER_API_KEY", "");
	vi.stubEnv("CHROMA_URL", "");
	dir = mkdtempSync(join(tmpdir(), "psi-engine-"));
	kb = createKnowledge({ url: `file:${join(dir, "kb.db")}`, embedder: createLexicalEmbedder() });
});

afterEach(async () => {
	vi.unstubAllEnvs();
	await kb.close();
	rmSync(dir, { recursive: true, force: true });
});

describe("psi's guides on the engine", () => {
	it("registers the four brands' agents and the knowledge base's vector store with Mastra", () => {
		const { mastra } = createPsiEngine({ knowledge: kb });
		const agents = mastra.listAgents();
		expect(Object.keys(agents).sort()).toEqual(["blog", "eqsync", "hemisync", "psizone"]);
		expect(mastra.getAgent("psizone").id).toBe("psi-guide-psizone");
		expect(mastra.getAgent("eqsync").name).toBe("Ghidul EQ-SYNC");
		expect(mastra.getVector("libsql")).toBe(kb.vector);
		expect(mastra.getScorer("psi-faithfulness").id).toBe("psi-faithfulness");
	});

	it("only Psizone carries the sister-brand rule", () => {
		expect(PSI_PROFILES.psizone.crossReferences).toHaveLength(1);
		expect(PSI_PROFILES.hemisync.crossReferences).toHaveLength(0);
	});

	it("without a key, the workflow refuses as unavailable after the crisis rules", async () => {
		const { mastra } = createPsiEngine({ knowledge: kb });
		const run = await mastra.getWorkflow("groundedAnswer").createRun();
		const Out = z.object({ result: z.object({ refusal: z.string().nullable() }) });
		const ask = async (question: string): Promise<string | null> =>
			Out.parse(await run.start({ inputData: { profile: "psizone", question, locale: "ro" } }))
				.result.refusal;
		expect(await ask("Cum decurge o evaluare?")).toBe("unavailable");
		const again = await mastra.getWorkflow("groundedAnswer").createRun();
		const crisis = Out.parse(
			await again.start({
				inputData: { profile: "psizone", question: "Nu mai vreau să trăiesc", locale: "ro" },
			}),
		);
		expect(crisis.result.refusal).toBe("crisis");
	});
});
