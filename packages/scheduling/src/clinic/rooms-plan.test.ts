import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { planFromSeed } from "./rooms-plan";
import { parseRoomsSeed, type RoomsSeed } from "./rooms-seed";

const seed: RoomsSeed = parseRoomsSeed(
	JSON.parse(readFileSync(join(import.meta.dirname, "../../seed/psizone-rooms.json"), "utf8")),
);
const ids = new Map(seed.floors.flatMap((f) => f.rooms.map((r) => [r.id, `store-${r.id}`])));

describe("Psizone's seeded rooms", () => {
	it("are three floors and eleven rooms in two categories", () => {
		expect(seed.floors.map((f) => f.rooms.length)).toEqual([2, 3, 6]);
		expect(new Set(seed.floors.flatMap((f) => f.rooms.map((r) => r.category)))).toEqual(
			new Set(["therapy", "neuro"]),
		);
	});
});

describe("the floor plan drawn from the seed", () => {
	it("has a room shape per seeded room, on its floor, naming the store's id", () => {
		const plan = planFromSeed(seed, ids, 3);
		expect(plan.revision).toBe(3);
		expect(plan.floors.map((f) => [f.id, f.shapes.length])).toEqual([
			["parter", 2],
			["etaj-1", 3],
			["etaj-2", 6],
		]);
		expect(plan.floors[0]?.shapes[0]).toEqual({
			id: "room-cabinet-1",
			kind: "room",
			label: "",
			roomId: "store-cabinet-1",
			geometry: { type: "rect", x: 10, y: 20, w: 95, h: 36 },
		});
	});

	it("is sized to hold every room, inside the service's bounds", () => {
		const plan = planFromSeed(seed, ids, 0);
		expect(plan.width).toBe(220);
		expect(plan.height).toBe(102);
		expect(plan.width).toBeGreaterThanOrEqual(50);
	});

	it("refuses a room the store does not hold, drawing nothing", () => {
		const partial = new Map(ids);
		partial.delete("neurofeedback-2");
		expect(() => planFromSeed(seed, partial, 0)).toThrow("neurofeedback-2");
	});
});
