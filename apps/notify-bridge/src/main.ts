import { serve } from "@hono/node-server";
import { catalogueWorkflows, createBridge } from "./bridge";
import { BridgeConfigError, loadBridgeConfig } from "./config";

let config: ReturnType<typeof loadBridgeConfig>;
try {
	config = loadBridgeConfig(process.env);
} catch (error) {
	process.stderr.write(
		`notify-bridge: ${error instanceof BridgeConfigError ? error.message : "invalid configuration"}\n`,
	);
	process.exit(1);
}

const workflows = catalogueWorkflows();
const server = serve({ fetch: createBridge(config, workflows).fetch, port: config.PORT });
process.stdout.write(
	`notify-bridge listening on :${config.PORT}, serving ${workflows.length} workflows\n`,
);
for (const signal of ["SIGTERM", "SIGINT"] as const)
	process.on(signal, () => {
		server.close(() => process.exit(0));
	});
