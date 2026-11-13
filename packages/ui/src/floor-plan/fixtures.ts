import type { FloorPlanDoc, Shape } from "./schema";

export const room = (
	id: string,
	x: number,
	y: number,
	w: number,
	h: number,
	roomId?: string,
): Shape => ({
	id,
	kind: "room",
	label: id,
	geometry: { type: "rect", x, y, w, h },
	...(roomId ? { roomId } : {}),
});

export function planOf(...shapes: Shape[]): FloorPlanDoc {
	return {
		version: 1,
		revision: 0,
		width: 200,
		height: 150,
		northDeg: 0,
		floors: [{ id: "f1", name: "Parter", shapes }],
	};
}
