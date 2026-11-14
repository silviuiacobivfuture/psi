import type { AddressInfo } from "node:net";
import { Worker } from "node:worker_threads";
import { serve } from "@hono/node-server";
import { createAccount, memoryStores } from "@psi/account";
import { z } from "zod";
import { createApp } from "../../src/app";
import { devApiSignIn } from "../../src/dev-signin";
import { createFakeNotifications } from "../../src/notifications/fake";
import { sdkPortSource } from "../../src/port/sdk/source";
import { createConsolePwa } from "../../src/pwa";

const Ready = z.object({
	url: z.string().url(),
	counts: z
		.object({
			clients: z.number(),
			appointments: z.number(),
			packages: z.number(),
			payments: z.number(),
			notes: z.number(),
			audit: z.number(),
		})
		.nullable(),
});
const Minted = z.object({ token: z.string().min(1) });

export interface Stack {
	apiUrl: string;
	/** The console on a real socket, over the service, signed in through the development flow. */
	consoleUrl: string;
	counts: z.infer<typeof Ready>["counts"];
	/** A bearer token for a person of the populated world (the service's development route). */
	tokenFor(subject: string): Promise<string>;
	close(): Promise<void>;
}

const ORIGIN = "http://clinic.load";

/**
 * The service (in-memory adapters, the populated synthetic clinic grown `factor` times) in a worker thread, and the
 * console over it in this one, both on real sockets: the load generator measures what a browser would (HTTP, the
 * console's calls to the service, the rendering), each side on its own event loop as in service. Never production:
 * everything here is synthetic and the sign-in is the development one.
 */
export async function startStack(factor: number): Promise<Stack> {
	const worker = new Worker(new URL("./api-worker.ts", import.meta.url), {
		workerData: { factor },
	});
	const ready = Ready.parse(
		await new Promise<unknown>((resolve, reject) => {
			worker.once("message", resolve);
			worker.once("error", reject);
		}),
	);
	const dev = devApiSignIn(ready.url, ORIGIN);
	const idle = createAccount({
		site: { slug: "clinic", key: "clinic", origin: ORIGIN, home: "/calendar" },
		stores: memoryStores(),
		onWarn: () => {},
		env: {},
	});
	const pwa = createConsolePwa(ORIGIN, idle);
	const app = createApp({
		ports: sdkPortSource({ baseUrl: ready.url, auth: dev.auth }),
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
		apiUrl: ready.url,
		consoleUrl: `http://127.0.0.1:${address.port}`,
		counts: ready.counts,
		async tokenFor(subject) {
			const res = await fetch(`${ready.url}/dev/token`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ subject }),
			});
			return Minted.parse(await res.json()).token;
		},
		close: async () => {
			await new Promise<void>((resolve) => server.close(() => resolve()));
			worker.postMessage("close");
			await new Promise<void>((resolve) => worker.once("exit", () => resolve()));
		},
	};
}
