import { serve } from "@hono/node-server";
import { account } from "./account";
import { createApp } from "./app";
import { createAssistantEngine } from "./assistant/mount";
import { accountAuth, DEV_SUBJECT, devAuth } from "./auth";
import { ENV, ORIGIN } from "./config";
import { createFakePort } from "./port/fake";
import { createConsolePwa } from "./pwa";

// Production never boots without a working sign-in: no local passwords, no open door.
if (ENV.production && !account.enabled)
	throw new Error(
		"MISSING REQUIRED SECRET: OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, SESSION_SECRET (sign-in is required)",
	);

const auth = ENV.devSignIn ? devAuth() : accountAuth(account);
if (ENV.devSignIn)
	console.warn(
		"[clinic] DEV sign-in is ON (CLINIC_DEV_SIGNIN): everyone is the demo person. Never in production.",
	);

if (!ENV.fakePort) {
	// The scheduling service's SDK replaces the fake behind ClinicPort; until that adapter exists a
	// deployment with no fake has nothing to serve, and says so instead of showing invented data.
	throw new Error(
		`the scheduling service adapter for ClinicPort is not wired yet (SCHEDULING_API_URL=${ENV.schedulingApi ?? ""}); set CLINIC_FAKE_PORT=1 for development`,
	);
}
if (ENV.fakePort)
	console.warn(
		"[clinic] the synthetic in-memory clinic is ON (CLINIC_FAKE_PORT). Never in production.",
	);

const port = createFakePort({
	members: {
		[DEV_SUBJECT]: [
			{ app: "psizone", roles: ["owner"] },
			{ app: "hemisync", roles: ["reception"] },
		],
	},
});

const pwa = createConsolePwa(ORIGIN, account);

const app = createApp({
	port,
	assistant: createAssistantEngine(process.env),
	auth,
	pwa,
	origin: ORIGIN,
	mount: (hono) => {
		if (!ENV.devSignIn) account.mount(hono);
		pwa.mount(hono);
	},
});

serve({ fetch: app.fetch, port: ENV.port });
console.log(`[clinic] http://localhost:${ENV.port}`);
