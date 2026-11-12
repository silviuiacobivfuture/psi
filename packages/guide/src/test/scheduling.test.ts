import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemorySchedulingStore } from "@psi/engine/testing";
import { createKnowledge, createLexicalEmbedder, type KnowledgeStore } from "@psi/knowledge";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPsiEngine, PSI_PROFILES, schedulingFromEnv } from "../index";

let dir: string;
let kb: KnowledgeStore;

beforeEach(() => {
	vi.stubEnv("OPENROUTER_API_KEY", "");
	vi.stubEnv("CHROMA_URL", "");
	dir = mkdtempSync(join(tmpdir(), "psi-scheduling-"));
	kb = createKnowledge({ url: `file:${join(dir, "kb.db")}`, embedder: createLexicalEmbedder() });
});

afterEach(async () => {
	vi.unstubAllEnvs();
	await kb.close();
	rmSync(dir, { recursive: true, force: true });
});

describe("scheduling in psi's guides", () => {
	it("only Psizone opts in, and names no service: the store says which are active", () => {
		expect(PSI_PROFILES.psizone.scheduling).toEqual({ tenant: "psizone", services: [] });
		expect(PSI_PROFILES.eqsync.scheduling).toBeUndefined();
		expect(PSI_PROFILES.hemisync.scheduling).toBeUndefined();
		expect(PSI_PROFILES.blog.scheduling).toBeUndefined();
	});

	it("with a store, Psizone gets a separate scheduling agent and Mastra the three tools", async () => {
		const engine = createPsiEngine({ knowledge: kb, scheduling: new MemorySchedulingStore() });
		expect(Object.keys(engine.mastra.listAgents()).sort()).toEqual([
			"blog",
			"eqsync",
			"hemisync",
			"psizone",
			"psizone-scheduling",
		]);
		expect(engine.mastra.getAgent("psizone-scheduling").id).toBe("psi-guide-psizone-scheduling");
		expect(Object.keys(engine.mastra.listTools() ?? {}).sort()).toEqual([
			"cancelRequest",
			"findAvailability",
			"requestAppointment",
			"searchKnowledge",
		]);
		// The grounded-answer agent holds only its knowledge tools; the scheduling tools stay apart.
		const own = Object.keys(await engine.guide("psizone").agent.listTools());
		expect(own).toContain("searchKnowledge");
		for (const id of ["cancelRequest", "findAvailability", "requestAppointment"]) {
			expect(own).not.toContain(id);
		}
	});

	it("without a store, nothing about scheduling exists", () => {
		const engine = createPsiEngine({ knowledge: kb });
		expect(engine.guide("psizone").scheduling).toBeUndefined();
		expect(Object.keys(engine.mastra.listTools() ?? {})).toEqual(["searchKnowledge"]);
	});

	it("reads the environment: off without CONVEX_URL, off without the key, on with both", () => {
		expect(schedulingFromEnv({})).toEqual({ ok: false, problem: "no_url" });
		expect(schedulingFromEnv({ CONVEX_URL: "http://127.0.0.1:3210" })).toEqual({
			ok: false,
			problem: "no_key",
		});
		expect(
			schedulingFromEnv({ CONVEX_URL: "not a url", PSI_SCHEDULING_KEY: "k".repeat(64) }),
		).toEqual({
			ok: false,
			problem: "invalid",
		});
		const on = schedulingFromEnv({
			CONVEX_URL: "http://127.0.0.1:3210",
			PSI_SCHEDULING_KEY: "k".repeat(64),
		});
		expect(on.ok).toBe(true);
		if (on.ok) {
			// The engine gets two functions, never the client with its hold and submit.
			expect(on.scheduling.port).not.toBe(on.scheduling.client);
			expect(Object.keys(on.scheduling.port).sort()).toEqual(["cancel", "catalogue", "findSlots"]);
			expect("hold" in on.scheduling.port).toBe(false);
			expect("submit" in on.scheduling.port).toBe(false);
		}
	});
});
