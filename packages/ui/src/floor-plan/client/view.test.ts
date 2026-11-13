import { describe, expect, it } from "vitest";
import { fitBox, MAX_ZOOM, MIN_ZOOM, panBy, pinch, toWorld, transformOf, zoomAt } from "./view";

describe("view maths", () => {
	it("zooming keeps the point under the cursor still", () => {
		const v = { k: 2, tx: 30, ty: 10 };
		const before = toWorld(v, 120, 80);
		const after = toWorld(zoomAt(v, 1.5, 120, 80), 120, 80);
		expect(after.x).toBeCloseTo(before.x);
		expect(after.y).toBeCloseTo(before.y);
	});
	it("clamps the zoom at both ends", () => {
		expect(zoomAt({ k: 30, tx: 0, ty: 0 }, 10, 0, 0).k).toBe(MAX_ZOOM);
		expect(zoomAt({ k: 1, tx: 0, ty: 0 }, 0.01, 0, 0).k).toBe(MIN_ZOOM);
	});
	it("pans", () => {
		expect(panBy({ k: 1, tx: 5, ty: 5 }, 3, -2)).toEqual({ k: 1, tx: 8, ty: 3 });
	});
	it("fits a box centred inside the padding", () => {
		const v = fitBox({ x: 10, y: 20, w: 100, h: 50 }, 400, 300, 20);
		expect(v.k).toBe(3.6);
		expect(toWorld(v, 200, 150)).toEqual({ x: 60, y: 45 });
	});
	it("fit never zooms past the cap and tolerates an empty box or stage", () => {
		expect(fitBox({ x: 0, y: 0, w: 1, h: 1 }, 400, 300, 0).k).toBe(14);
		expect(fitBox({ x: 0, y: 0, w: 0, h: 0 }, 400, 300, 0)).toEqual({ k: 1, tx: 0, ty: 0 });
		expect(fitBox({ x: 0, y: 0, w: 5, h: 5 }, 0, 0, 0)).toEqual({ k: 1, tx: 0, ty: 0 });
	});
	it("a pinch spreading doubles the scale about its centre and follows the fingers", () => {
		const v = pinch(
			{ k: 1, tx: 0, ty: 0 },
			{ x: 90, y: 100 },
			{ x: 110, y: 100 },
			{ x: 80, y: 100 },
			{ x: 120, y: 100 },
		);
		expect(v.k).toBe(2);
		expect(toWorld(v, 100, 100)).toEqual({ x: 100, y: 100 });
	});
	it("a pinch with both fingers on one spot only pans", () => {
		const v = pinch(
			{ k: 2, tx: 0, ty: 0 },
			{ x: 5, y: 5 },
			{ x: 5, y: 5 },
			{ x: 9, y: 9 },
			{ x: 9, y: 9 },
		);
		expect(v).toEqual({ k: 2, tx: 4, ty: 4 });
	});
	it("writes an SVG matrix", () => {
		expect(transformOf({ k: 2, tx: 3, ty: 4 })).toBe("matrix(2 0 0 2 3 4)");
	});
});
