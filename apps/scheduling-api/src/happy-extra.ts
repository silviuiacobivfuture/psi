import type { Populated } from "./testing/populate";
import type { Reply } from "./testing/world";

/**
 * The happy paths of the routes added after the first table, one file per area so no file passes its size. The key set is
 * the type: `happy.test.ts` demands a case for every route of the contract that is neither a stream nor here.
 */
export type Case = (w: Populated) => Promise<Reply>;
const A = "/v1/apps/psizone";
export const olga = (w: Populated, method: string, path: string, body?: unknown): Promise<Reply> =>
	w.call("olga", method, `${A}${path}`, body);

/** A plan with one floor, edited from `revision`. */
export const planAt = (revision: number) => ({
	doc: {
		version: 1,
		revision,
		width: 300,
		height: 200,
		northDeg: 0,
		floors: [{ id: "f1", name: "Parter", shapes: [] }],
	},
});

export const EXTRA_HAPPY = {
	"floorPlan.get": (w) => olga(w, "GET", "/floor-plan"),
	"floorPlan.put": (w) => olga(w, "PUT", "/floor-plan", planAt(0)),
} satisfies Record<string, Case>;
export type ExtraId = keyof typeof EXTRA_HAPPY;
