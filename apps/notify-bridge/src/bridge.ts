import { Client, type Workflow } from "@novu/framework";
import { serve } from "@novu/framework/hono";
import { RUNTIME } from "@psi/notify/registry";
import { Hono } from "hono";
import type { BridgeConfig } from "./config";

/** Every workflow of psi's notification catalogue (@psi/notify), for every app it declares. */
export const catalogueWorkflows = (): Workflow[] => RUNTIME.flatMap((r) => r.workflows());

/**
 * psi's Novu bridge: the code-first workflows of @psi/notify, served where Novu calls them (`/api/novu`), with every
 * request checked against the environment's secret key (Novu signs it; `strictAuthentication` stays on). `/healthz` is the
 * probe's and says nothing else.
 */
export function createBridge(
	config: Pick<BridgeConfig, "NOVU_SECRET_KEY" | "NOVU_API_URL">,
	workflows: Workflow[] = catalogueWorkflows(),
): Hono {
	const app = new Hono();
	const handler = serve({
		client: new Client({ secretKey: config.NOVU_SECRET_KEY, apiUrl: config.NOVU_API_URL }),
		workflows,
	});
	app.get("/healthz", (c) => c.text("ok"));
	app.on(["GET", "POST", "OPTIONS"], "/api/novu", (c) => handler(c));
	return app;
}
