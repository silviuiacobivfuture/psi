import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { embedderFromEnv } from "../embedder/select";
import type { Embedder } from "../embedder/types";
import { type Env, readDemoKnowledge } from "../env/flags";
import { openRouterKeyFrom } from "../env/key-file";
import { createKnowledge, type IngestReport } from "../knowledge";
import { SEED } from "../seed/index";
import { DEFAULT_DB_URL } from "../seed/ingest";
import type { VectorConfig } from "../store/config";
import { DEMO } from "./index";

/**
 * Ingests the seed plus the demo entries, every brand and locale, into the configured store
 * (`vector`, else Chroma when `CHROMA_URL` is set, else LibSQL at `url`). Refused unless
 * `PSI_DEMO_KNOWLEDGE=true`, and refused in production.
 */
export async function ingestSeedAndDemo(opts: {
	env: Env;
	url: string;
	embedder?: Embedder;
	vector?: VectorConfig;
}): Promise<IngestReport> {
	if (!readDemoKnowledge(opts.env)) {
		throw new Error("the demo ingest needs PSI_DEMO_KNOWLEDGE=true (local development only)");
	}
	const k = createKnowledge({
		url: opts.url,
		embedder: opts.embedder ?? embedderFromEnv(opts.env),
		...(opts.vector === undefined ? {} : { vector: opts.vector }),
	});
	try {
		return await k.ingest([...SEED, ...DEMO]);
	} finally {
		await k.close();
	}
}

/**
 * `pnpm --filter @psi/knowledge ingest-demo [--key-from ../../apps/psizone-web/.env]`. With
 * `--key-from`, `OPENROUTER_API_KEY` is read from that file (never from the shell, never
 * printed), so the OpenRouter embedder the sites search with writes the vectors; without it the
 * lexical embedder does.
 */
async function main(): Promise<void> {
	const { values } = parseArgs({ options: { "key-from": { type: "string" } } });
	const keyFile = values["key-from"];
	const key = keyFile === undefined ? undefined : openRouterKeyFrom(keyFile);
	if (keyFile !== undefined && key === undefined) {
		throw new Error(`no OPENROUTER_API_KEY in ${keyFile}`);
	}
	const env: Env = { ...process.env, OPENROUTER_API_KEY: key ?? "" };
	const report = await ingestSeedAndDemo({
		env,
		url: process.env.PSI_KNOWLEDGE_DB_URL?.trim() || DEFAULT_DB_URL,
	});
	const demo = report.indexed.filter((e) => e.id.startsWith("demo-")).length;
	process.stdout.write(
		[
			`store: ${report.store.kind} (${report.store.location})`,
			`embedder: ${report.embedder.kind} (${report.embedder.model}, ${report.embedder.dimension ?? "-"} dimensions)`,
			`indexed: ${report.indexed.length} entries (${demo} demo), ${report.chunks} chunks`,
			`skipped: ${report.skipped.map((s) => `${s.id} (${s.reason})`).join(", ") || "none"}`,
			`indexes: ${[...new Set(report.indexed.map((e) => e.index))].sort().join(", ")}`,
			"",
		].join("\n"),
	);
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
	main().catch((err: unknown) => {
		process.stderr.write(
			`ingest-demo failed: ${err instanceof Error ? err.message : String(err)}\n`,
		);
		process.exitCode = 1;
	});
}
