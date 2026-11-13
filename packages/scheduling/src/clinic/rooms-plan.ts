import type { RoomsSeed } from "./rooms-seed";

/** The plan's envelope, as the service checks it (`FloorPlanDocument`), with one `room` shape per seeded room. */
export interface SeededPlan {
	version: 1;
	revision: number;
	width: number;
	height: number;
	northDeg: number;
	floors: {
		id: string;
		name: string;
		shapes: {
			id: string;
			kind: "room";
			label: string;
			roomId: string;
			geometry: { type: "rect"; x: number; y: number; w: number; h: number };
		}[];
	}[];
}

/** Room ids are the store's: the plan names each seeded room by the id the store gave it (`stored`, by seed id). */
export function planFromSeed(
	seed: RoomsSeed,
	stored: ReadonlyMap<string, string>,
	revision: number,
): SeededPlan {
	const floors = [...seed.floors]
		.sort((a, b) => a.order - b.order)
		.map((floor) => ({
			id: floor.id,
			name: floor.name,
			shapes: floor.rooms.map((room) => {
				const roomId = stored.get(room.id);
				if (roomId === undefined) throw new Error(`room ${room.id} is not in the store`);
				return {
					id: `room-${room.id}`,
					kind: "room" as const,
					label: "",
					roomId,
					geometry: { type: "rect" as const, ...room.geometry },
				};
			}),
		}));
	const rooms = seed.floors.flatMap((f) => f.rooms);
	const right = Math.max(...rooms.map((r) => r.geometry.x + r.geometry.w));
	const bottom = Math.max(...rooms.map((r) => r.geometry.y + r.geometry.h));
	return {
		version: 1,
		revision,
		width: Math.max(50, right + 10),
		height: Math.max(50, bottom + 10),
		northDeg: 0,
		floors,
	};
}
