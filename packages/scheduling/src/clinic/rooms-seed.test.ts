import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRoomsSeed } from "./rooms-seed";

const file = JSON.parse(
	readFileSync(new URL("../../seed/psizone-rooms.json", import.meta.url), "utf8"),
);

describe("the Psizone rooms seed", () => {
	it("is valid and holds the owner's three floors and eleven rooms", () => {
		const seed = parseRoomsSeed(file);
		expect(seed.floors.map((f) => f.name)).toEqual(["Parter", "Etajul 1", "Etajul 2"]);
		expect(seed.floors.flatMap((f) => f.rooms)).toHaveLength(11);
		const neuro = seed.floors.flatMap((f) => f.rooms).filter((r) => r.category === "neuro");
		expect(neuro.map((r) => r.name).sort()).toEqual([
			"Mapping cerebral",
			"Neurofeedback 1",
			"Neurofeedback 2",
		]);
	});
	it("refuses a duplicate room, an unknown category and a room with no floor", () => {
		const dup = structuredClone(file);
		dup.floors[1].rooms[0].id = dup.floors[0].rooms[0].id;
		expect(() => parseRoomsSeed(dup)).toThrow();
		const cat = structuredClone(file);
		cat.floors[0].rooms[0].category = "other";
		expect(() => parseRoomsSeed(cat)).toThrow();
		const none = structuredClone(file);
		none.floors = [];
		expect(() => parseRoomsSeed(none)).toThrow();
	});
	it("keeps every room inside a 220 by 140 plan and off its neighbours", () => {
		const seed = parseRoomsSeed(file);
		for (const f of seed.floors)
			for (const [i, a] of f.rooms.entries()) {
				expect(a.geometry.x + a.geometry.w).toBeLessThanOrEqual(220);
				expect(a.geometry.y + a.geometry.h).toBeLessThanOrEqual(140);
				for (const b of f.rooms.slice(i + 1)) {
					const apart =
						a.geometry.x + a.geometry.w <= b.geometry.x ||
						b.geometry.x + b.geometry.w <= a.geometry.x ||
						a.geometry.y + a.geometry.h <= b.geometry.y ||
						b.geometry.y + b.geometry.h <= a.geometry.y;
					expect(apart, `${a.id} / ${b.id}`).toBe(true);
				}
			}
	});
});
