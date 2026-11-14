import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { createAccount, memoryStores } from "@psi/account";
import { createApp } from "../../src/app";
import { devApiSignIn } from "../../src/dev-signin";
import { createFakeNotifications } from "../../src/notifications/fake";
import { sdkPortSource } from "../../src/port/sdk/source";
import { createConsolePwa } from "../../src/pwa";

const ORIGIN = "http://clinic.load";

export interface RunningConsole {
	url: string;
	close(): Promise<void>;
}

/** One console over the service at `apiUrl`, on a real socket, signed in through the development flow. */
export async function startConsole(apiUrl: string): Promise<RunningConsole> {
	const dev = devApiSignIn(apiUrl, ORIGIN);
	const idle = createAccount({
		site: { slug: "clinic", key: "clinic", origin: ORIGIN, home: "/calendar" },
		stores: memoryStores(),
		onWarn: () => {},
		env: {},
	});
	const pwa = createConsolePwa(ORIGIN, idle);
	const app = createApp({
		ports: sdkPortSource({ baseUrl: apiUrl, auth: dev.auth }),
		notifications: createFakeNotifications({ seeded: false }),
		viewAsSecret: "v".repeat(40),
		auth: dev.auth,
		pwa,
		origin: ORIGIN,
		mount: (h) => {
			dev.mount(h);
			pwa.mount(h);
		},
	});
	const server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
	await new Promise<void>((resolve) => server.once("listening", () => resolve()));
	const address: string | AddressInfo | null = server.address();
	if (address === null || typeof address === "string") throw new Error("the console has no port");
	return {
		url: `http://127.0.0.1:${address.port}`,
		close: () => new Promise<void>((resolve) => server.close(() => resolve())),
	};
}
