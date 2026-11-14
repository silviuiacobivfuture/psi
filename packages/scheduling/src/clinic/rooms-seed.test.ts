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
	it("names the old system's rooms: four are the owner's rooms, two are legacy", () => {
		const seed = parseRoomsSeed(file);
		const former = Object.fromEntries(
			seed.floors.flatMap((f) =>
				f.rooms.filter((r) => r.formerly.length > 0).map((r) => [r.name, r.formerly]),
			),
		);
		expect(former).toEqual({
			"Turcu Adrian": ["Cabinet Psihoterapie 1"],
			"Turcu Daniela": ["Cabinet Psihoterapie 2"],
			"Cabinet psihoterapie": ["Cabinet Grup"],
			"Sală terapie grup": ["Sală Grup / Hemi-Sync"],
		});
		expect(seed.legacy).toEqual(["Cabinet Terapie", "Sală Kinetoterapie"]);
	});
	it("refuses a name given to two rooms, diacritics and case aside", () => {
		const twice = structuredClone(file);
		twice.legacy = ["SALA terapie grup"];
		expect(() => parseRoomsSeed(twice)).toThrow(/given to two rooms/);
		const former = structuredClone(file);
		former.floors[0].rooms[0].formerly = ["cabinet 2"];
		expect(() => parseRoomsSeed(former)).toThrow(/given to two rooms/);
	});
	it("a seed without former or legacy names is still valid", () => {
		const bare = structuredClone(file);
		delete bare.legacy;
		for (const f of bare.floors) for (const r of f.rooms) delete r.formerly;
		const seed = parseRoomsSeed(bare);
		expect(seed.legacy).toEqual([]);
		expect(seed.floors.flatMap((f) => f.rooms).every((r) => r.formerly.length === 0)).toBe(true);
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
