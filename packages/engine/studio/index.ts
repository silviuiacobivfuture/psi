import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";
import { createPsiEngine, schedulingFromEnv } from "@psi/guide";
import { chromaFromEnv, createKnowledge, embedderFromEnv } from "@psi/knowledge";

/**
 * Mastra Studio's entry (`pnpm --filter @psi/engine studio`): the engine with psi's four profiles,
 * on http://localhost:4360. It reads the LOCAL Chroma (`CHROMA_URL`, default
 * http://localhost:8000, no token), with the embedder the environment selects, as the sites do:
 * OpenRouter with `OPENROUTER_API_KEY` (`--env ../../apps/<site>/.env`), else the lexical one. The
 * answering model takes `OPENROUTER_API_KEY` and `PSI_GUIDE_MODEL` from the environment; without a
 * key every answer is `unavailable`, while the `searchKnowledge` tool still shows what retrieval
 * finds. The `ingestKnowledge` workflow writes the `seed` set (and `demo`, with
 * `PSI_DEMO_KNOWLEDGE=true`) with that same embedder. Studio's own runs and traces go to
 * `.data/studio.db` beside this package. With `CONVEX_URL` and `PSI_SCHEDULING_KEY` (the local
 * Convex, see packages/scheduling/README.md) Psizone's scheduling agent and the
 * `findAvailability`, `requestAppointment` and `cancelRequest` tools are registered too.
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
	embedder: embedderFromEnv(),
});

const scheduling = schedulingFromEnv(process.env);
if (!scheduling.ok && scheduling.problem !== "no_url") {
	console.error(`engine: scheduling is off (${scheduling.problem})`);
}

export const mastra: Mastra = createPsiEngine({
	knowledge,
	...(scheduling.ok ? { scheduling: scheduling.scheduling.port } : {}),
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
