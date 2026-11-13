import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import { FloorPlanDocument } from "@psi/scheduling-sdk/contract";
import type { Ctx, HandlersOf } from "../http/context";
import { fail } from "../http/errors";
import { StoreRefused } from "../store/types";

type C = Ctx<RouteSpec>;

/** The stored plan as the contract states it: the text is the service's own write, so one that no longer parses is a fault, not an input. */
function plan(ctx: C, stored: { revision: number; body: string }) {
	const parsed = FloorPlanDocument.safeParse(JSON.parse(stored.body));
	if (!parsed.success || parsed.data.revision !== stored.revision) {
		ctx.deps.log({ level: "error", event: "floor_plan_unreadable", requestId: ctx.requestId });
		throw fail("internal", "the stored plan cannot be read");
	}
	return parsed.data;
}

export const floorPlanHandlers: HandlersOf<"floorPlan.get" | "floorPlan.put"> = {
	async "floorPlan.get"(ctx) {
		const stored = await ctx.deps.store.docs.get(ctx.app, "floor_plan");
		if (stored === undefined) return { revision: 0 };
		return {
			revision: stored.revision,
			doc: plan(ctx, stored),
			updatedAt: stored.updatedAt,
			updatedBy: stored.updatedBy,
		};
	},

	async "floorPlan.put"(ctx) {
		const edited = ctx.body.doc.revision;
		const next = { ...ctx.body.doc, revision: edited + 1 };
		try {
			const saved = await ctx.deps.store.docs.put(
				ctx.app,
				"floor_plan",
				edited,
				JSON.stringify(next),
			);
			ctx.note({ revision: saved.revision, floors: next.floors.length });
			return {
				revision: saved.revision,
				doc: next,
				updatedAt: saved.updatedAt,
				updatedBy: ctx.subject,
			};
		} catch (error) {
			if (!(error instanceof StoreRefused) || error.reason !== "stale") throw error;
			const held = await ctx.deps.store.docs.get(ctx.app, "floor_plan");
			throw fail("conflict", "the plan was saved by someone else; load it again", {
				reason: "stale",
				revision: held?.revision ?? 0,
			});
		}
	},
};
