import { serve } from "@hono/node-server";
import { buildDeps } from "./build";
import { ConfigError, loadConfig } from "./config";
import { createApp } from "./http/app";

let config: ReturnType<typeof loadConfig>;
try {
	config = loadConfig(process.env);
} catch (error) {
	// A half-configured service answers, and its answers are wrong: say what is missing and do not start.
	process.stderr.write(
		`scheduling-api: ${error instanceof ConfigError ? error.message : "invalid configuration"}\n`,
	);
	process.exit(1);
}

const deps = buildDeps(config);
const origins = (process.env.CORS_ORIGINS ?? "")
	.split(",")
	.map((o) => o.trim())
	.filter((o) => o !== "");
const server = serve({ fetch: createApp(deps, { corsOrigins: origins }).fetch, port: config.port });
process.stdout.write(
	`scheduling-api listening on :${config.port} (${config.env}, store ${config.store.kind}, authz ${config.authz.kind})\n`,
);
for (const signal of ["SIGTERM", "SIGINT"] as const)
	process.on(signal, () => server.close(() => process.exit(0)));
