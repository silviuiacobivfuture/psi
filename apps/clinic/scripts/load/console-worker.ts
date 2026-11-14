import { parentPort, workerData } from "node:worker_threads";
import { z } from "zod";
import { startConsole } from "./console";

/** One console replica of the load test in a thread of its own (in service each replica is its own pod). */
const Data = z.object({ apiUrl: z.string().url() });
const { apiUrl } = Data.parse(workerData);
const running = await startConsole(apiUrl);
parentPort?.on("message", async (message: unknown) => {
	if (message === "close") {
		await running.close();
		process.exit(0);
	}
});
parentPort?.postMessage({ url: running.url });
