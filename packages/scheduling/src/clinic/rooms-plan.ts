import type { RoomsSeed } from "./rooms-seed";

/** The floor plan's drawing area, in plan units: the seed's room geometry is laid out inside it. */
export const PLAN_WIDTH = 220;
export const PLAN_HEIGHT = 140;

/**
 * The floor plan a rooms seed draws: the owner's floors in order, each room a rectangle where the seed puts it,
 * linked to the clinic's room by `roomIdOf` (the seed's own id for the demo, the store's id once the rooms exist) and
 * tagged with its category, plus the legend's categories. Plain JSON in the plan editor's document shape; the editor and
 * the service validate it.
 */
export function roomsPlanDocument(
	seed: RoomsSeed,
	roomIdOf: (seedId: string) => string,
	revision = 0,
) {
	return {
		version: 1 as const,
		revision,
		width: PLAN_WIDTH,
		height: PLAN_HEIGHT,
		northDeg: 0,
		categories: seed.categories.map((c) => ({ id: c.id, label: c.label })),
		floors: [...seed.floors]
			.sort((a, b) => a.order - b.order)
			.map((f) => ({
				id: f.id,
				name: f.name,
				shapes: f.rooms.map((r) => ({
					id: `r-${r.id}`,
					kind: "room" as const,
					label: "",
					roomId: roomIdOf(r.id),
					category: r.category,
					geometry: {
						type: "rect" as const,
						x: r.geometry.x,
						y: r.geometry.y,
						w: r.geometry.w,
						h: r.geometry.h,
					},
				})),
			})),
	};
}
