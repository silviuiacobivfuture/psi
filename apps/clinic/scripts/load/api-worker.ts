import { parentPort, workerData } from "node:worker_threads";
import { startApi } from "@psi/scheduling-api/testing";
import { type ScaleCounts, scaleUp } from "@psi/scheduling-api/testing-scale";
import { z } from "zod";

/**
 * The scheduling service of the load test, in a thread of its own: in service it is its own process, so the console's
 * measured time must not include the service's CPU (one event loop for both would double every number).
 */
const Data = z.object({ factor: z.number().int().min(0) });
const { factor } = Data.parse(workerData);
let counts: ScaleCounts | null = null;
const api = await startApi(
	factor > 0
		? {
				grow: async (world) => {
					counts = await scaleUp(world, factor);
				},
			}
		: {},
);
parentPort?.on("message", async (message: unknown) => {
	if (message === "close") {
		await api.close();
		process.exit(0);
	}
});
parentPort?.postMessage({ url: api.url, counts });
