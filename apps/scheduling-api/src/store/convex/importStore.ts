import { z } from "zod";
import { type Collection, type ImportRow, StoreRefused } from "../types";
import { matches } from "./recordSupport";
import { answer, type Rpc, unwrap } from "./rpc";

/**
 * Import runs, read only. The import (packages/scheduling `import:old`) is run by operators with the admin key, not
 * through this API, and records no run row of its own: a run is derived from its `import.batch` audit events (batches
 * within ten minutes of each other are one run, the counts are rows changed per table). Writing one through the
 * service is refused.
 */
const Runs = answer({
	runs: z.array(
		z.object({
			startedAt: z.number(),
			finishedAt: z.number(),
			counts: z.record(z.string(), z.number()),
		}),
	),
});

export function importCollection(rpc: Rpc): Collection<ImportRow> {
	const list = async (app: string): Promise<ImportRow[]> =>
		unwrap(await rpc.query("apiRecordsExtra:importRuns", { tenant: app }, Runs)).runs.map((r) => ({
			id: `imp-${r.startedAt}`,
			app,
			source: "old-app",
			status: "done" as const,
			counts: r.counts,
			startedAt: r.startedAt,
			finishedAt: r.finishedAt,
		}));
	const refuse = (): Promise<never> => Promise.reject(new StoreRefused("not_allowed"));
	return {
		async get(app, id) {
			return (await list(app)).find((r) => r.id === id);
		},
		async list(app, query) {
			return (await list(app)).filter((r) => matches(r, query));
		},
		insert: refuse,
		replace: refuse,
		remove: refuse,
	};
}
