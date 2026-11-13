import { describe, expect, it } from "vitest";
import { room } from "./fixtures";
import {
	areaSquareMetres,
	boundsOfShape,
	closesPolygon,
	hitTest,
	pointInPolygon,
	polygonIsSimple,
	rectFromDrag,
	resizeRect,
	rotateGeometry90,
	snap,
	snapPoint,
	snapToWall,
	translateGeometry,
} from "./geometry";
import type { Geometry, RectGeometry, Shape } from "./schema";

const rect = (x: number, y: number, w: number, h: number): RectGeometry => ({
	type: "rect",
	x,
	y,
	w,
	h,
});
const poly = (...pts: Array<[number, number]>): Geometry => ({
	type: "polygon",
	points: pts.map(([x, y]) => ({ x, y })),
});

describe("snap", () => {
	it.each([
		[0, 5, 0],
		[2, 5, 0],
		[3, 5, 5],
		[7.4, 5, 5],
		[-2, 5, 0],
		[-3, 5, -5],
		[12.5, 10, 10],
		[13, 1, 13],
		[13.6, 1, 14],
		[4, 0, 4],
	])("snap(%s, %s) = %s", (v, step, out) => {
		expect(snap(v, step)).toBe(out);
	});
	it("snaps both axes", () => {
		expect(snapPoint({ x: 12, y: 18 }, 5)).toEqual({ x: 10, y: 20 });
	});
});

describe("drawing a rectangle", () => {
	it("normalises any drag direction and snaps", () => {
		expect(rectFromDrag({ x: 41, y: 33 }, { x: 10, y: 8 }, 5)).toEqual(rect(10, 10, 30, 25));
	});
	it("refuses a rectangle under the minimum side", () => {
		expect(rectFromDrag({ x: 10, y: 10 }, { x: 12, y: 40 }, 5)).toBeUndefined();
		expect(rectFromDrag({ x: 10, y: 10 }, { x: 15, y: 15 }, 5)).toEqual(rect(10, 10, 5, 5));
	});
});

describe("resizeRect", () => {
	const r = rect(10, 10, 40, 30);
	it.each([
		["e", 10, 0, rect(10, 10, 50, 30)],
		["w", 10, 0, rect(20, 10, 30, 30)],
		["n", 0, -10, rect(10, 0, 40, 40)],
		["s", 0, 10, rect(10, 10, 40, 40)],
		["se", 5, 5, rect(10, 10, 45, 35)],
		["nw", -5, -5, rect(5, 5, 45, 35)],
		["ne", 5, -5, rect(10, 5, 45, 35)],
		["sw", -5, 5, rect(5, 10, 45, 35)],
	] as const)("%s handle", (h, dx, dy, out) => {
		expect(resizeRect(r, h, dx, dy)).toEqual(out);
	});
	it("never collapses: the opposite edge stays and a side keeps its minimum", () => {
		expect(resizeRect(r, "e", -100, 0)).toEqual(rect(10, 10, 5, 30));
		expect(resizeRect(r, "w", 100, 0)).toEqual(rect(45, 10, 5, 30));
		expect(resizeRect(r, "s", 0, -100)).toEqual(rect(10, 10, 40, 5));
	});
});

describe("rotation", () => {
	it("turns a rectangle about its centre, and four turns are the identity", () => {
		const r = rect(10, 10, 40, 20);
		const once = rotateGeometry90(r);
		expect(once).toEqual(rect(20, 0, 20, 40));
		let g: Geometry = r;
		for (let i = 0; i < 4; i++) g = rotateGeometry90(g);
		expect(g).toEqual(r);
	});
	it("four turns restore an odd-sized rectangle exactly", () => {
		const r = rect(3, 7, 11, 4);
		let g: Geometry = r;
		for (let i = 0; i < 4; i++) g = rotateGeometry90(g);
		expect(g).toEqual(r);
	});
	it("turns a polygon clockwise about its box centre and four turns restore it", () => {
		const p = poly([0, 0], [40, 0], [40, 20]);
		const once = rotateGeometry90(p);
		expect(once).toEqual(poly([30, -10], [30, 30], [10, 30]));
		let g: Geometry = p;
		for (let i = 0; i < 4; i++) g = rotateGeometry90(g);
		expect(g).toEqual(p);
	});
});

describe("polygon drawing", () => {
	const pts = [
		{ x: 0, y: 0 },
		{ x: 40, y: 0 },
		{ x: 40, y: 30 },
	];
	it("closes on the first point only with three corners, within the tolerance", () => {
		expect(closesPolygon(pts, { x: 2, y: 1 }, 3)).toBe(true);
		expect(closesPolygon(pts, { x: 4, y: 0 }, 3)).toBe(false);
		expect(closesPolygon(pts.slice(0, 2), { x: 0, y: 0 }, 3)).toBe(false);
		expect(closesPolygon([], { x: 0, y: 0 }, 3)).toBe(false);
	});
	it("accepts a simple polygon, refuses a bow-tie, a line and fewer than three", () => {
		expect(polygonIsSimple(pts)).toBe(true);
		expect(
			polygonIsSimple([
				{ x: 0, y: 0 },
				{ x: 10, y: 10 },
				{ x: 10, y: 0 },
				{ x: 0, y: 10 },
			]),
		).toBe(false);
		expect(
			polygonIsSimple([
				{ x: 0, y: 0 },
				{ x: 5, y: 5 },
				{ x: 10, y: 10 },
			]),
		).toBe(false);
		expect(polygonIsSimple(pts.slice(0, 2))).toBe(false);
	});
});

describe("hit-testing", () => {
	const shapes: Shape[] = [
		room("a", 0, 0, 40, 30),
		room("b", 30, 10, 40, 30),
		{
			id: "d",
			kind: "door",
			label: "",
			at: { x: 20, y: 0 },
			length: 9,
			rotation: 0,
			swing: "left",
		},
		{
			id: "poly",
			kind: "space",
			label: "",
			spaceType: "corridor",
			geometry: poly([100, 0], [140, 0], [100, 40]) as never,
		},
	];
	it("returns the topmost area, and small things win over the area under them", () => {
		expect(hitTest(shapes, { x: 35, y: 15 }, 2)?.id).toBe("b");
		expect(hitTest(shapes, { x: 10, y: 10 }, 2)?.id).toBe("a");
		expect(hitTest(shapes, { x: 20, y: 1 }, 2)?.id).toBe("d");
	});
	it("hits a polygon inside and not in its bounding box's empty corner", () => {
		expect(hitTest(shapes, { x: 105, y: 5 }, 2)?.id).toBe("poly");
		expect(hitTest(shapes, { x: 135, y: 35 }, 2)).toBeUndefined();
	});
	it("misses empty ground", () => {
		expect(hitTest(shapes, { x: 150, y: 100 }, 2)).toBeUndefined();
		expect(hitTest([], { x: 0, y: 0 }, 2)).toBeUndefined();
	});
	it("treats an edge point as inside", () => {
		expect(
			pointInPolygon({ x: 0, y: 5 }, [
				{ x: 0, y: 0 },
				{ x: 10, y: 0 },
				{ x: 10, y: 10 },
				{ x: 0, y: 10 },
			]),
		).toBe(true);
	});
});

describe("walls", () => {
	const shapes = [room("a", 0, 0, 40, 30)];
	it("snaps to the nearest wall, clamped to its ends, with the wall's orientation", () => {
		expect(snapToWall(shapes, { x: 17, y: 2 }, 4)).toEqual({
			at: { x: 17, y: 0 },
			rotation: 0,
			shapeId: "a",
		});
		expect(snapToWall(shapes, { x: 39, y: 12 }, 4)).toEqual({
			at: { x: 40, y: 12 },
			rotation: 90,
			shapeId: "a",
		});
		expect(snapToWall(shapes, { x: 60, y: 0 }, 30)?.at).toEqual({ x: 40, y: 0 });
	});
	it("finds no wall beyond the distance", () => {
		expect(snapToWall(shapes, { x: 20, y: 15 }, 4)).toBeUndefined();
	});
	it("ignores diagonal walls", () => {
		const tri: Shape = {
			id: "t",
			kind: "space",
			label: "",
			spaceType: "other",
			geometry: poly([0, 0], [20, 20], [0, 20]) as never,
		};
		expect(snapToWall([tri], { x: 10, y: 9 }, 2)).toBeUndefined();
	});
});

describe("measures", () => {
	it("area in square metres: 100 square units are one", () => {
		expect(areaSquareMetres(rect(0, 0, 40, 30))).toBe(12);
		expect(areaSquareMetres(poly([0, 0], [40, 0], [0, 30]))).toBe(6);
	});
	it("translates both kinds", () => {
		expect(translateGeometry(rect(1, 1, 2, 2), 3, 4)).toEqual(rect(4, 5, 2, 2));
		expect(translateGeometry(poly([0, 0], [1, 0], [0, 1]), 2, 2)).toEqual(
			poly([2, 2], [3, 2], [2, 3]),
		);
	});
	it("bounds of a vertical window are tall and thin", () => {
		expect(
			boundsOfShape({
				id: "w",
				kind: "window",
				label: "",
				at: { x: 10, y: 10 },
				length: 20,
				rotation: 90,
			}),
		).toEqual({ x: 6, y: 0, w: 8, h: 20 });
	});
});
