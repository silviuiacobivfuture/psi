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

const PLANS: Record<AppSlug, unknown> = {
	psizone: {
		version: 1,
		revision: 1,
		width: 220,
		height: 140,
		northDeg: 0,
		floors: [
			{
				id: "parter",
				name: "Parter",
				shapes: [
					space("receptie", "reception", rect(10, 10, 50, 45)),
					space("asteptare", "waiting", rect(60, 10, 50, 45)),
					space("wc", "wc", rect(110, 10, 25, 45)),
					space("hol", "corridor", rect(10, 55, 190, 14)),
					room("r-terapie", "r1", "", rect(10, 69, 90, 55)),
					room("r-grup", "g1", "", rect(100, 69, 100, 55)),
					door("d-terapie", 50, 69),
					door("d-grup", 145, 69),
					{
						id: "v-nfb",
						kind: "device",
						label: "",
						at: { x: 60, y: 100 },
						rotation: 0,
						deviceType: "nfb-amplifier",
						deviceId: "d1",
					},
				],
			},
		],
	},
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
