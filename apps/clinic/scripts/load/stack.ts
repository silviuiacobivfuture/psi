import { Worker } from "node:worker_threads";
import { z } from "zod";
import { startConsole } from "./console";

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
const ConsoleReady = z.object({ url: z.string().url() });
const Minted = z.object({ token: z.string().min(1) });

export interface Stack {
	apiUrl: string;
	/** The console replicas on real sockets, over the service, signed in through the development flow. */
	consoleUrls: string[];
	counts: z.infer<typeof Ready>["counts"];
	/** A bearer token for a person of the populated world (the service's development route). */
	tokenFor(subject: string): Promise<string>;
	close(): Promise<void>;
}

/** Starts a worker and waits for the first message it posts (its address). */
async function started(worker: Worker): Promise<unknown> {
	return new Promise<unknown>((resolve, reject) => {
		worker.once("message", resolve);
		worker.once("error", reject);
	});
}

async function stopped(worker: Worker): Promise<void> {
	worker.postMessage("close");
	await new Promise<void>((resolve) => worker.once("exit", () => resolve()));
}

/**
 * The service (in-memory adapters, the populated synthetic clinic grown `factor` times) in a worker thread, and the
 * console over it, both on real sockets: the load generator measures what a browser would (HTTP, the console's calls to
 * the service, the rendering). `consoles` 0 runs one console in this thread, beside the load generator (as the first
 * measurements did); 1 or more runs that many replicas, each in a thread of its own, the load spread over them as an
 * ingress would. Never production: everything here is synthetic and the sign-in is the development one.
 */
export async function startStack(factor: number, consoles = 0): Promise<Stack> {
	const worker = new Worker(new URL("./api-worker.ts", import.meta.url), {
		workerData: { factor },
	});
	const ready = Ready.parse(await started(worker));
	const replicas = await Promise.all(
		Array.from({ length: consoles }, async () => {
			const thread = new Worker(new URL("./console-worker.ts", import.meta.url), {
				workerData: { apiUrl: ready.url },
			});
			return { thread, url: ConsoleReady.parse(await started(thread)).url };
		}),
	);
	const local = consoles === 0 ? await startConsole(ready.url) : undefined;
	return {
		apiUrl: ready.url,
		consoleUrls: local === undefined ? replicas.map((r) => r.url) : [local.url],
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
			await local?.close();
			await Promise.all(replicas.map((r) => stopped(r.thread)));
			await stopped(worker);
		},
	};
}
