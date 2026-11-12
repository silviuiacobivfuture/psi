import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";
import { createPsiEngine, type Knowledge, schedulingFromEnv } from "@psi/guide";
import { chromaFromEnv, createKnowledge, embedderFromEnv } from "@psi/knowledge";
import { edgeGuard } from "../auth/edge-guard";
import { studioAuthFor } from "../auth/from-config";
import { loadConfig } from "../config";

/**
 * Mastra Studio for staff (`mastra build --dir src/mastra --studio`; the image runs
 * `.mastra/output/index.mjs`): psi's four guides on the engine, behind Authentik.
 *
 * What Studio can reach is narrowed on purpose. The knowledge base is handed over as SEARCH only,
 * so neither the `ingest-knowledge` workflow (it writes the shared Chroma every site reads) nor
 * the raw vector store is registered. The scheduling tools (they create real appointment holds in
 * Convex) are wired only with AGENT_STUDIO_SCHEDULING=on. Runs and traces go to libSQL under
 * AGENT_STUDIO_DATA_DIR.
 */
const config = loadConfig(process.env);
const log = (message: string): void => console.error(message);

const dataDir = resolve(config.dataDir);
mkdirSync(dataDir, { recursive: true });

const store = createKnowledge({
	vector: chromaFromEnv() ?? { kind: "chroma", url: "http://localhost:8000" },
	embedder: embedderFromEnv(),
});
const searchOnly: Knowledge = { search: (q) => store.search(q) };

const scheduling = config.scheduling ? schedulingFromEnv(process.env) : null;
if (scheduling !== null && !scheduling.ok)
	log(`agent-studio: scheduling is off (${scheduling.problem})`);

const auth = studioAuthFor(config, log);
const pub = config.publicUrl;

export const mastra: Mastra = createPsiEngine({
	knowledge: searchOnly,
	...(scheduling?.ok === true ? { scheduling: scheduling.scheduling.port } : {}),
	onFailure: (failure) =>
		log(`agent-studio: ${failure.profile} ${failure.stage}: ${failure.error}`),
	mastra: {
		server: {
			port: config.port,
			host: "0.0.0.0",
			...(auth === undefined
				? {}
				: config.auth.kind === "on" && config.auth.surface === "server-auth"
					? { auth }
					: { middleware: [{ path: "*", handler: edgeGuard(auth) }] }),
			...(pub === null
				? {}
				: {
						studioHost: pub.hostname,
						studioProtocol: pub.protocol === "https:" ? "https" : "http",
						studioPort: Number(pub.port || (pub.protocol === "https:" ? 443 : 80)),
					}),
		},
		storage: new LibSQLStore({
			id: "psi-agent-studio",
			url: `file:${resolve(dataDir, "studio.db")}`,
		}),
	},
}).mastra;
