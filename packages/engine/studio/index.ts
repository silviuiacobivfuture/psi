import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";
import { createPsiEngine } from "@psi/guide";
import { chromaFromEnv, createKnowledge, createLexicalEmbedder } from "@psi/knowledge";

/**
 * Mastra Studio's entry (`pnpm --filter @psi/engine studio`): the engine with psi's four profiles,
 * on http://localhost:4360. It reads the LOCAL Chroma (`CHROMA_URL`, default
 * http://localhost:8000, no token), searched with the lexical embedder the local seed was written
 * with (`pnpm --filter @psi/knowledge ingest-seed`). The answering model takes
 * `OPENROUTER_API_KEY` and `PSI_GUIDE_MODEL` from the environment; without a key every answer is
 * `unavailable`, while the `searchKnowledge` tool still shows what retrieval finds. Studio's own
 * runs and traces go to `.data/studio.db` beside this package.
 */
export const STUDIO_PORT = 4360;

/** This package's folder: `mastra dev` runs the bundle from `<package>/.mastra/output`. */
function packageRoot(here: string): string {
	const bundled = here.indexOf("/.mastra/");
	return bundled >= 0 ? here.slice(0, bundled) : resolve(here, "..");
}

const dataDir = join(packageRoot(import.meta.dirname), ".data");
mkdirSync(dataDir, { recursive: true });

const knowledge = createKnowledge({
	vector: chromaFromEnv() ?? { kind: "chroma", url: "http://localhost:8000" },
	embedder: createLexicalEmbedder(),
});

export const mastra: Mastra = createPsiEngine({
	knowledge,
	onFailure: (failure) =>
		console.error(`engine: ${failure.profile} ${failure.stage}: ${failure.error}`),
	mastra: {
		server: { port: STUDIO_PORT, host: "localhost" },
		storage: new LibSQLStore({
			id: "psi-engine-studio",
			url: `file:${join(dataDir, "studio.db")}`,
		}),
	},
}).mastra;
