import { serve } from "@hono/node-server";
import type { Hono } from "hono";
import { account } from "./account";
import { createApp } from "./app";
import { createAssistantEngine } from "./assistant/mount";
import { accountAuth, devAuth } from "./auth";
import { ENV, ORIGIN } from "./config";
import { DEMO_PEOPLE } from "./demo";
import { devApiSignIn } from "./dev-signin";
import { createFakeNotifications } from "./notifications/fake";
import { createNovuNotifications } from "./notifications/novu";
import type { NotificationsPort } from "./notifications/port";
import { deviceSync, mountNovuPush } from "./novu-push";
import { createFakePort } from "./port/fake";
import { sdkPortSource } from "./port/sdk/source";
import { fixedPort } from "./port/source";
import { createConsolePwa } from "./pwa";

// Production never boots without a working sign-in: no local passwords, no open door.
if (ENV.production && !account.enabled)
	throw new Error(
		"MISSING REQUIRED SECRET: OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, SESSION_SECRET (sign-in is required)",
	);

const { novu } = ENV;

const pwa = createConsolePwa(
	ORIGIN,
	account,
	novu === null ? {} : { onDevicesChanged: (subject) => deviceSync(novu, pwa)(subject) },
);

/** The bell's feed: the estate's Novu when it is configured, the development feed with the synthetic clinic, else no bell. */
function notificationsFeed(): NotificationsPort | undefined {
	if (novu !== null) return createNovuNotifications(novu);
	if (ENV.fakePort) return createFakeNotifications();
	console.warn("[clinic] no NOVU_* settings: the notification bell is off");
	return undefined;
}

/** Routes the PWA and the Novu push webhook sit on (public: Novu signs its calls). */
function mountDevices(hono: Hono): void {
	pwa.mount(hono);
	mountNovuPush(hono, pwa, novu);
}

if (ENV.fakePort) {
	console.warn(
		"[clinic] the synthetic in-memory clinic is ON (CLINIC_FAKE_PORT). Never in production.",
	);
	if (ENV.devSignIn)
		console.warn(
			"[clinic] DEV sign-in is ON (CLINIC_DEV_SIGNIN): everyone is the demo person. Never in production.",
		);
	const auth = ENV.devSignIn ? devAuth() : accountAuth(account);
	const notifications = notificationsFeed();
	const app = createApp({
		ports: fixedPort(createFakePort(DEMO_PEOPLE)),
		...(notifications === undefined ? {} : { notifications }),
		assistant: createAssistantEngine(process.env),
		viewAsSecret: ENV.sessionSecret,
		auth,
		pwa,
		origin: ORIGIN,
		mount: (hono) => {
			if (!ENV.devSignIn) account.mount(hono);
			mountDevices(hono);
		},
	});
	serve({ fetch: app.fetch, port: ENV.port });
} else {
	// The scheduling service answers every call, AS the signed-in person (their own token).
	if (ENV.schedulingApi === null) throw new Error("MISSING REQUIRED SETTING: SCHEDULING_API_URL");
	const dev = ENV.devSignIn ? devApiSignIn(ENV.schedulingApi, ORIGIN) : null;
	if (dev !== null)
		console.warn(
			"[clinic] DEV sign-in is ON (CLINIC_DEV_SIGNIN): you sign in as anyone the local scheduling service knows. Never in production.",
		);
	const auth = dev?.auth ?? accountAuth(account);
	const notifications = notificationsFeed();
	const app = createApp({
		ports: sdkPortSource({ baseUrl: ENV.schedulingApi, auth }),
		...(notifications === undefined ? {} : { notifications }),
		assistant: createAssistantEngine(process.env),
		viewAsSecret: ENV.sessionSecret,
		auth,
		pwa,
		origin: ORIGIN,
		mount: (hono) => {
			if (dev === null) account.mount(hono);
			else dev.mount(hono);
			mountDevices(hono);
		},
	});
	serve({ fetch: app.fetch, port: ENV.port });
}
console.log(`[clinic] http://localhost:${ENV.port}`);
