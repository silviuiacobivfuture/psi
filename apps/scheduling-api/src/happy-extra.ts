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

/** A flag on a phone number of its own, so a case never meets another's entry. */
let flagged = 0;
const flag = async (w: Populated, over: Record<string, unknown> = {}): Promise<string> => {
	flagged += 1;
	const made = await olga(w, "POST", "/blacklist", {
		phone: `+4072000${String(1000 + flagged)}`,
		reason: "synthetic reason",
		category: "other",
		severity: "warn",
		...over,
	});
	return String(made.json.id);
};

export const EXTRA_HAPPY = {
	"floorPlan.get": (w) => olga(w, "GET", "/floor-plan"),
	"floorPlan.put": (w) => olga(w, "PUT", "/floor-plan", planAt(0)),
	"blacklist.list": (w) => olga(w, "GET", "/blacklist"),
	"blacklist.create": (w) =>
		olga(w, "POST", "/blacklist", {
			phone: "+40721000001",
			reason: "synthetic reason",
			category: "no_show_repeated",
			severity: "warn",
		}),
	"blacklist.get": async (w) => olga(w, "GET", `/blacklist/${await flag(w)}`),
	"blacklist.update": async (w) =>
		olga(w, "PATCH", `/blacklist/${await flag(w)}`, { severity: "block_online" }),
	"blacklist.remove": async (w) => olga(w, "DELETE", `/blacklist/${await flag(w)}`),
	"blacklist.check": (w) => olga(w, "GET", "/blacklist/check?phone=%2B40721000001"),
	"blacklist.events": (w) => olga(w, "GET", "/blacklist/events"),
} satisfies Record<string, Case>;
export type ExtraId = keyof typeof EXTRA_HAPPY;
