import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createKnowledge,
	createLexicalEmbedder,
	DEMO,
	type KnowledgeStore,
	ProductionGuardError,
} from "@psi/knowledge";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createPsiEngine } from "../index";
import { readGuideEnv } from "../model";

let dir: string;
let kb: KnowledgeStore;

beforeEach(() => {
	vi.stubEnv("OPENROUTER_API_KEY", "");
	vi.stubEnv("CHROMA_URL", "");
	vi.stubEnv("PSI_DEMO_KNOWLEDGE", "");
	vi.stubEnv("PSI_OPENROUTER_DATA_COLLECTION", "");
	dir = mkdtempSync(join(tmpdir(), "psi-demo-"));
	kb = createKnowledge({ url: `file:${join(dir, "kb.db")}`, embedder: createLexicalEmbedder() });
});

afterEach(async () => {
	vi.unstubAllEnvs();
	await kb.close();
	rmSync(dir, { recursive: true, force: true });
});

describe("the guide's environment", () => {
	it("defaults to deny, model screening on, no demo", () => {
		expect(readGuideEnv({})).toEqual({
			apiKey: undefined,
			model: undefined,
			screeningModel: undefined,
			modelScreening: true,
			dataCollection: "deny",
			demo: false,
			sort: "latency",
		});
	});

	it("reads the free-development switches outside production", () => {
		const env = readGuideEnv({
			PSI_OPENROUTER_DATA_COLLECTION: "allow",
			PSI_GUIDE_MODEL: "vendor/chat:free",
			PSI_SCREENING_MODEL: "vendor/guard:free",
			PSI_MODEL_SCREENING: "off",
			PSI_DEMO_KNOWLEDGE: "true",
		});
		expect(env).toMatchObject({
			dataCollection: "allow",
			model: "vendor/chat:free",
			screeningModel: "vendor/guard:free",
			modelScreening: false,
			demo: true,
		});
	});

	it("refuses every development-only switch in production, at startup", () => {
		for (const prod of [{ NODE_ENV: "production" }, { SITE_ENV: "production" }]) {
			for (const flag of [
				{ PSI_OPENROUTER_DATA_COLLECTION: "allow" },
				{ PSI_MODEL_SCREENING: "off" },
				{ PSI_DEMO_KNOWLEDGE: "true" },
			]) {
				expect(() => readGuideEnv({ ...prod, ...flag })).toThrow(ProductionGuardError);
			}
			expect(readGuideEnv(prod).dataCollection).toBe("deny");
		}
		vi.stubEnv("SITE_ENV", "production");
		vi.stubEnv("PSI_DEMO_KNOWLEDGE", "true");
		expect(() => createPsiEngine({ knowledge: kb })).toThrow(ProductionGuardError);
	});

	it("refuses a malformed switch", () => {
		expect(() => readGuideEnv({ PSI_MODEL_SCREENING: "maybe" })).toThrow();
		expect(() => readGuideEnv({ PSI_OPENROUTER_DATA_COLLECTION: "yes" })).toThrow();
	});
});

const Passages = z.object({
	passages: z.array(z.object({ source: z.object({ id: z.string(), title: z.string() }) })),
});

async function searchTool(query: string): Promise<ReadonlyArray<{ id: string; title: string }>> {
	const tool = createPsiEngine({ knowledge: kb }).mastra.getTool("searchKnowledge");
	const out = await tool.execute?.({ profile: "eqsync", locale: "ro", query }, {});
	return Passages.parse(out).passages.map((p) => p.source);
}

describe("the demo knowledge", () => {
	it("is served only with PSI_DEMO_KNOWLEDGE=true, marked [DEMO]", async () => {
		await kb.ingest(DEMO.filter((e) => e.brand === "eqsync"));
		expect(await searchTool("căști stereo")).toEqual([]);
		vi.stubEnv("PSI_DEMO_KNOWLEDGE", "true");
		const found = await searchTool("căști stereo");
		expect(found.length).toBeGreaterThan(0);
		for (const s of found) {
			expect(s.id.startsWith("demo-eqsync-ro-")).toBe(true);
			expect(s.title.startsWith("[DEMO] ")).toBe(true);
		}
	});

	const RunSchema = z.object({
		status: z.string(),
		result: z
			.object({
				sets: z.array(z.object({ name: z.string(), entries: z.number() })),
				report: z.object({
					indexed: z.array(z.object({ id: z.string() })),
					skipped: z.array(z.object({ id: z.string(), reason: z.string() })),
				}),
			})
			.optional(),
	});

	it("is ingested through the ingest-knowledge workflow only with the flag", async () => {
		const off = createPsiEngine({ knowledge: kb }).mastra.getWorkflow("ingestKnowledge");
		const refused = await (await off.createRun()).start({ inputData: { sets: ["demo"] } });
		expect(RunSchema.parse(refused).status).toBe("failed");

		vi.stubEnv("PSI_DEMO_KNOWLEDGE", "true");
		const on = createPsiEngine({ knowledge: kb }).mastra.getWorkflow("ingestKnowledge");
		const out = RunSchema.parse(
			await (await on.createRun()).start({ inputData: { sets: ["seed", "demo"] } }),
		);
		expect(out.status).toBe("success");
		expect(out.result?.sets.map((s) => s.name)).toEqual(["seed", "demo"]);
		expect(out.result?.report.skipped).toHaveLength(8);
		expect(out.result?.report.skipped.every((s) => s.reason === "clinical-unreviewed")).toBe(true);
		expect(out.result?.report.indexed.filter((e) => e.id.startsWith("demo-"))).toHaveLength(120);
	});
});
