import { type Engine, type EngineIngestReport, EngineIngestReportSchema } from "@psi/engine";
import type { IndexStat, KnowledgeStore } from "@psi/knowledge";
import { z } from "zod";
import type { Brand } from "./contract";

/**
 * What staff may ask of one brand's guide through the control plane, read-only except for the
 * rebuild: the agent as Mastra registered it (the voice, the model, the tools), the knowledge
 * base's indexes, and a re-ingest that runs the engine's `ingestKnowledge` workflow, so the run
 * shows in Studio like any other. Nothing here answers a visitor or keeps a question.
 */
export interface GuideAgentInfo {
	id: string;
	name: string;
	model: string;
	hasKey: boolean;
	instructions: string;
	tools: ReadonlyArray<{ id: string; description: string }>;
	locales: ReadonlyArray<string>;
	scheduling: boolean;
	workflows: ReadonlyArray<string>;
}

export type GuideIngestOutcome =
	| { ok: true; runId: string; report: EngineIngestReport }
	| { ok: false; reason: string };

export interface GuideOperations {
	agent(): Promise<GuideAgentInfo>;
	/** Knowledge store facts, or null when the guide reads a plain `Knowledge` (no store). */
	readonly knowledge: {
		store: string;
		embedder: { kind: string; model: string };
		indexStats(): Promise<ReadonlyArray<IndexStat>>;
		/** Removes these entries' chunks from every index (withdrawn or unpublished content). */
		remove(ids: ReadonlyArray<string>): Promise<void>;
	} | null;
	/** Runs `ingestKnowledge` with these entries (already parsed and filtered by the caller). */
	ingest(entries: ReadonlyArray<Record<string, unknown>>): Promise<GuideIngestOutcome>;
}

export const INGEST_WORKFLOW_KEY = "ingestKnowledge";

const Text = z.string();
const Instructions = z.union([
	Text,
	z.array(z.union([Text, z.object({ content: Text }).passthrough()])),
	z.object({ content: Text }).passthrough(),
]);
const Tool = z
	.object({ id: z.string().optional(), description: z.string().optional() })
	.passthrough();
const Run = z.object({
	status: z.string(),
	result: z.object({ report: EngineIngestReportSchema }).passthrough().optional(),
	error: z.unknown().optional(),
});

function instructionsText(raw: unknown): string {
	const p = Instructions.safeParse(raw);
	if (!p.success) return "";
	const d = p.data;
	if (typeof d === "string") return d;
	if (Array.isArray(d)) return d.map((x) => (typeof x === "string" ? x : x.content)).join("\n");
	return d.content;
}

export function guideOperations(
	engine: Engine,
	brand: Brand,
	store: KnowledgeStore | undefined,
): GuideOperations {
	const profile = engine.guide(brand);
	return {
		async agent() {
			const agent = profile.agent;
			const tools = await agent.listTools();
			return {
				id: agent.id,
				name: agent.name,
				model: engine.model,
				hasKey: engine.hasApiKey,
				instructions: instructionsText(await agent.getInstructions()),
				tools: Object.entries(tools).map(([key, t]) => {
					const tool = Tool.safeParse(t);
					return {
						id: (tool.success ? tool.data.id : undefined) ?? key,
						description: (tool.success ? tool.data.description : undefined) ?? "",
					};
				}),
				locales: Object.keys(profile.profile.locales),
				scheduling: profile.scheduling !== undefined,
				workflows: Object.keys(engine.mastra.listWorkflows()),
			};
		},
		knowledge:
			store === undefined
				? null
				: {
						store: `${store.store.kind} (${store.store.location})`,
						embedder: { kind: store.embedder.kind, model: store.embedder.model },
						indexStats: () => store.indexStats(brand),
						remove: (ids) => store.remove(ids),
					},
		async ingest(entries) {
			if (store === undefined) return { ok: false, reason: "no knowledge store" };
			const workflow = engine.mastra.getWorkflow(INGEST_WORKFLOW_KEY);
			const run = await workflow.createRun();
			const out = Run.safeParse(
				await run.start({ inputData: { sets: [], entries: [...entries] } }),
			);
			if (!out.success) return { ok: false, reason: "the workflow answered an unexpected shape" };
			if (out.data.status !== "success" || out.data.result === undefined) {
				const why = out.data.error instanceof Error ? out.data.error.message : out.data.status;
				return { ok: false, reason: String(why) };
			}
			return { ok: true, runId: run.runId, report: out.data.result.report };
		},
	};
}
