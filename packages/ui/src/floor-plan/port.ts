import { type FloorPlanDoc, FloorPlanDocSchema } from "./schema";

/** Why a save was refused. */
export type SaveRefusal = "stale" | "invalid";

export type SaveResult = { ok: true; doc: FloorPlanDoc } | { ok: false; reason: SaveRefusal };

/** Where the plan lives. The console implements it with its API; the demo uses `memoryPort`. */
export interface FloorPlanPort {
	load(): Promise<FloorPlanDoc>;
	/** Saves `doc`, which was edited from revision `doc.revision`; the stored copy gets revision + 1. Refused as "stale" when the store has moved on. */
	save(doc: FloorPlanDoc): Promise<SaveResult>;
}

/** An in-memory port: the demo's, and the tests'. Every document in and out is parsed. */
export function memoryPort(initial: FloorPlanDoc): FloorPlanPort & { saves: () => number } {
	let stored = FloorPlanDocSchema.parse(initial);
	let saves = 0;
	return {
		saves: () => saves,
		load: async () => stored,
		save: async (doc) => {
			const parsed = FloorPlanDocSchema.safeParse(doc);
			if (!parsed.success) return { ok: false, reason: "invalid" };
			if (parsed.data.revision !== stored.revision) return { ok: false, reason: "stale" };
			stored = { ...parsed.data, revision: stored.revision + 1 };
			saves++;
			return { ok: true, doc: stored };
		},
	};
}
