import { describe, expect, it } from "vitest";
import {
	addFloor,
	addShape,
	findShape,
	insertPoint,
	movePoint,
	moveShapes,
	newId,
	removeFloor,
	removeShapes,
	renameFloor,
	resizeShape,
	rotateShapes,
	updateShape,
} from "./edit";
import { planOf, room } from "./fixtures";
import { MAX_FLOORS, MAX_SHAPES_PER_FLOOR, parsePlan, type Shape } from "./schema";

const doc = () =>
	planOf(room("a", 10, 10, 40, 30, "nfb-1"), {
		id: "d",
		kind: "door",
		label: "",
		at: { x: 10, y: 20 },
		length: 9,
		rotation: 90,
		swing: "left",
	});
const ids = (...x: string[]) => new Set(x);

describe("edits", () => {
	it("adds a shape; refuses a taken id and a full floor, returning the same document", () => {
		const d = doc();
		expect(findShape(addShape(d, "f1", room("b", 60, 10, 20, 20)), "b")).toBeDefined();
		expect(addShape(d, "f1", room("a", 60, 10, 20, 20))).toBe(d);
		expect(addShape(d, "nope", room("b", 60, 10, 20, 20))).toBe(d);
		const full = planOf(
			...Array.from({ length: MAX_SHAPES_PER_FLOOR }, (_v, i) => room(`r${i}`, 0, 0, 5, 5)),
		);
		expect(addShape(full, "f1", room("extra", 0, 0, 5, 5))).toBe(full);
	});

	it("moves areas and points; the result stays valid", () => {
		const moved = moveShapes(doc(), ids("a", "d"), 5, -5);
		expect(findShape(moved, "a")).toMatchObject({ geometry: { x: 15, y: 5 } });
		expect(findShape(moved, "d")).toMatchObject({ at: { x: 15, y: 15 } });
		expect(parsePlan(moved).success).toBe(true);
	});

	it("keeps a move inside the drawing area by shortening it, and does nothing when it cannot move", () => {
		const d = doc();
		const far = moveShapes(d, ids("a"), -500, 0);
		expect(findShape(far, "a")).toMatchObject({ geometry: { x: 0 } });
		expect(moveShapes(far, ids("a"), -5, 0)).toBe(far);
		expect(moveShapes(d, ids("ghost"), 5, 5)).toBe(d);
	});

	it("rotates areas into new outlines and doors into new rotations; four turns restore", () => {
		let d = doc();
		d = rotateShapes(d, ids("a", "d"));
		expect(findShape(d, "d")).toMatchObject({ rotation: 180 });
		expect(findShape(d, "a")).toMatchObject({ geometry: { w: 30, h: 40 } });
		for (let i = 0; i < 3; i++) d = rotateShapes(d, ids("a", "d"));
		expect(d).toEqual(doc());
	});

	it("resizes a rectangle inside the area only", () => {
		const d = doc();
		expect(findShape(resizeShape(d, "a", "e", 10, 0), "a")).toMatchObject({ geometry: { w: 50 } });
		expect(resizeShape(d, "a", "e", 1000, 0)).toEqual(d);
		expect(resizeShape(d, "d", "e", 10, 0)).toEqual(d);
	});

	it("moves and inserts polygon corners, refused outside the area and over the cap", () => {
		const tri: Shape = {
			id: "p",
			kind: "space",
			label: "",
			spaceType: "other",
			geometry: {
				type: "polygon",
				points: [
					{ x: 0, y: 0 },
					{ x: 10, y: 0 },
					{ x: 0, y: 10 },
				],
			},
		};
		const d = planOf(tri);
		expect(findShape(movePoint(d, "p", 1, { x: 20, y: 0 }), "p")).toMatchObject({
			geometry: {
				points: [
					{ x: 0, y: 0 },
					{ x: 20, y: 0 },
					{ x: 0, y: 10 },
				],
			},
		});
		expect(movePoint(d, "p", 1, { x: -1, y: 0 })).toEqual(d);
		expect(movePoint(d, "p", 9, { x: 1, y: 0 })).toEqual(d);
		const more = insertPoint(d, "p", 0, { x: 5, y: 0 });
		expect(findShape(more, "p")).toMatchObject({
			geometry: {
				points: [
					{ x: 0, y: 0 },
					{ x: 5, y: 0 },
					{ x: 10, y: 0 },
					{ x: 0, y: 10 },
				],
			},
		});
	});

	it("deletes shapes, and does nothing for an id that is not there", () => {
		const d = doc();
		expect(findShape(removeShapes(d, ids("a")), "a")).toBeUndefined();
		expect(removeShapes(d, ids("zzz"))).toBe(d);
	});

	it("updates only what the kind has", () => {
		const d = doc();
		expect(findShape(updateShape(d, "a", { label: "NFB 1", roomId: "nfb-2" }), "a")).toMatchObject({
			label: "NFB 1",
			roomId: "nfb-2",
		});
		expect(findShape(updateShape(d, "a", { roomId: undefined }), "a")).not.toHaveProperty("roomId");
		expect(
			findShape(updateShape(d, "a", { spaceType: "wc", deviceType: "other" }), "a"),
		).not.toHaveProperty("spaceType");
		expect(findShape(updateShape(d, "d", { swing: "right", length: 12 }), "d")).toMatchObject({
			swing: "right",
			length: 12,
		});
	});

	it("generates ids that never collide", () => {
		expect(newId(doc(), "room")).toBe("room-1");
		expect(newId(addShape(doc(), "f1", room("room-1", 60, 10, 20, 20)), "room")).toBe("room-2");
	});

	it("manages floors: add to the cap, rename, never remove the last", () => {
		let d = doc();
		d = addFloor(d, "Etaj 1");
		expect(d.floors.map((f) => f.name)).toEqual(["Parter", "Etaj 1"]);
		while (d.floors.length < MAX_FLOORS) d = addFloor(d, "x");
		expect(addFloor(d, "one more")).toBe(d);
		expect(renameFloor(doc(), "f1", "").floors[0]?.name).toBe("Parter");
		expect(renameFloor(doc(), "f1", "Subsol").floors[0]?.name).toBe("Subsol");
		expect(removeFloor(doc(), "f1")).toEqual(doc());
		expect(removeFloor(addFloor(doc(), "E"), "f1").floors).toHaveLength(1);
		expect(parsePlan(d).success).toBe(true);
	});
});
