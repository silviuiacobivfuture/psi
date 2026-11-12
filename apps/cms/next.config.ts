import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";

const here = dirname(fileURLToPath(import.meta.url));

/** A self-contained server (`output: standalone`), traced from the repository root (pnpm links). */
const config: NextConfig = {
	output: "standalone",
	outputFileTracingRoot: join(here, "../.."),
	poweredByHeader: false,
	// Next 16 writes an AGENTS.md into the app on `next dev`; psi keeps its agent rules in CLAUDE.md.
	agentRules: false,
	// psi's workspace packages ship TypeScript source; the guide's vector store stays a runtime dependency.
	transpilePackages: ["@psi/cms-client", "@psi/content", "@psi/knowledge"],
	serverExternalPackages: [
		"@mastra/libsql",
		"@libsql/client",
		"libsql",
		"@mastra/chroma",
		"chromadb",
	],
	// cms.psizone.ro/ is the admin's address: the bare origin answers 308 to /admin (/api untouched).
	async redirects() {
		return [{ source: "/", destination: "/admin", permanent: true }];
	},
};

export default withPayload(config, { devBundleServerPackages: false });
