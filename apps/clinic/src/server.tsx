import { serve } from "@hono/node-server";
import { account } from "./account";
import { createApp } from "./app";
import { accountAuth, DEV_SUBJECT, devAuth } from "./auth";
import { ENV, ORIGIN } from "./config";
import { createFakePort } from "./port/fake";
import { pwa } from "./pwa";

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

const port = createFakePort({
	members: {
		[DEV_SUBJECT]: [
			{ app: "psizone", roles: ["owner"] },
			{ app: "hemisync", roles: ["reception"] },
		],
	},
});

const app = createApp({
	port,
	auth,
	origin: ORIGIN,
	mount: (hono) => {
		if (!ENV.devSignIn) account.mount(hono);
		pwa.mount(hono);
	},
});

serve({ fetch: app.fetch, port: ENV.port });
console.log(`[clinic] http://localhost:${ENV.port}`);
