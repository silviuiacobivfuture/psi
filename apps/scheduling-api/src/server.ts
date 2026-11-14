import { serve } from "@hono/node-server";
import { buildDeps } from "./build";
import { ConfigError, deliversNotices, loadConfig } from "./config";
import { createScheduler } from "./engagement/scheduler";
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
// The scheduled notices (reminders, the day's lists, the owners' numbers): one pass a minute, each thing claimed once
// across replicas. Only where notices are delivered: elsewhere there is nobody to tell, or they are held.
const stopScheduler = !deliversNotices(config)
	? () => undefined
	: createScheduler({
			store: deps.store,
			sso: deps.sso,
			port: deps.notifier,
			clock: deps.clock,
			log: deps.log,
			leads: config.reminders,
		}).start();
process.stdout.write(
	`scheduling-api listening on :${config.port} (${config.env}, store ${config.store.kind}, authz ${config.authz.kind}, notices ${config.delivery})\n`,
);
for (const signal of ["SIGTERM", "SIGINT"] as const)
	process.on(signal, () => {
		stopScheduler();
		server.close(() => process.exit(0));
	});
