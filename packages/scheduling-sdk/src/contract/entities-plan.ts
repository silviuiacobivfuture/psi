import { z } from "zod/v4";
import { Ms, Subject } from "./primitives";

/** The floor plan is drawn in an editor the service does not own: it keeps the document whole and checks its envelope. */
export const FLOOR_PLAN_VERSION = 1;
/** The most the service stores for one plan (the serialized document): a plan of 8 floors of 400 shapes is far below it. */
export const FLOOR_PLAN_MAX_BYTES = 512_000;
const PlanId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);

/**
 * A floor plan as stored: the envelope (version, size, north, floors with their ids and names) is the service's to check;
 * the shapes on a floor are the editor's own and are kept as they were drawn. `revision` counts the saves.
 */
export const FloorPlanDocument = z
	.object({
		version: z.literal(FLOOR_PLAN_VERSION),
		revision: z.number().int().min(0),
		width: z.number().int().min(50).max(5_000),
		height: z.number().int().min(50).max(5_000),
		northDeg: z.number().int().min(0).max(359),
		/** The room categories the plan's legend names (both languages); the editor's own, kept whole. */
		categories: z
			.array(
				z.object({
					id: z.string().min(1).max(40),
					label: z.object({ ro: z.string().min(1).max(120), en: z.string().min(1).max(120) }),
				}),
			)
			.max(8)
			.optional(),
		floors: z
			.array(
				z.looseObject({
					id: PlanId,
					name: z.string().min(1).max(40),
					shapes: z.array(z.record(z.string(), z.unknown())).max(400),
				}),
			)
			.min(1)
			.max(8),
	})
	.refine((doc) => JSON.stringify(doc).length <= FLOOR_PLAN_MAX_BYTES, "the plan is too large");

/** What an app has stored: nothing yet (revision 0), or the plan with who saved it last and when. */
export const FloorPlan = z.object({
	revision: z.number().int().min(0),
	doc: FloorPlanDocument.optional(),
	updatedAt: Ms.optional(),
	updatedBy: Subject.optional(),
});

/**
 * A save carries the plan as edited, whose `revision` is the one it was edited from. The stored plan moving on is a 409
 * (`conflict`, detail `reason: "stale"` and the stored `revision`), never an overwrite; a save stores revision + 1.
 */
export const FloorPlanPut = z.object({ doc: FloorPlanDocument });
