import { parseRoomsSeed, roomsPlanDocument } from "@psi/scheduling/clinic";
import psizoneRooms from "@psi/scheduling/seed/psizone-rooms.json";
import { type FloorPlanDoc, FloorPlanDocSchema } from "@psi/ui/admin/floor-plan";
import type { AppSlug } from "./schema";

const rect = (x: number, y: number, w: number, h: number) => ({
	type: "rect" as const,
	x,
	y,
	w,
	h,
});
const room = (id: string, roomId: string, label: string, g: ReturnType<typeof rect>) => ({
	id,
	kind: "room" as const,
	label,
	roomId,
	geometry: g,
});
const space = (
	id: string,
	spaceType: "reception" | "waiting" | "corridor" | "wc",
	g: ReturnType<typeof rect>,
) => ({ id, kind: "space" as const, label: "", spaceType, geometry: g });
const door = (id: string, x: number, y: number) => ({
	id,
	kind: "door" as const,
	label: "",
	at: { x, y },
	length: 9,
	rotation: 0 as const,
	swing: "left" as const,
});

/** The plan of Psizone: the owner's three floors, the rooms where the seed puts them, and the categories' legend. */
function psizonePlan(): unknown {
	return roomsPlanDocument(parseRoomsSeed(psizoneRooms), (id) => id, 1);
}

const PLANS: Record<AppSlug, unknown> = {
	psizone: psizonePlan(),
	hemisync: {
		version: 1,
		revision: 1,
		width: 160,
		height: 100,
		northDeg: 0,
		floors: [
			{
				id: "parter",
				name: "Parter",
				shapes: [
					space("primire", "reception", rect(10, 10, 140, 25)),
					room("r-hemi", "hr1", "", rect(10, 35, 70, 55)),
					room("r-club", "hg1", "", rect(80, 35, 70, 55)),
					door("d-hemi", 40, 35),
					door("d-club", 110, 35),
				],
			},
		],
	},
};

/** The synthetic clinic's drawn plan for an app (revision 1; saving counts it up). */
export function seedPlan(app: AppSlug): FloorPlanDoc {
	return FloorPlanDocSchema.parse(PLANS[app]);
}
