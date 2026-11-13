import type {
	AreaShape,
	Geometry,
	Point,
	PointShape,
	RectGeometry,
	Rotation,
	Shape,
} from "./schema";

export interface Bounds {
	x: number;
	y: number;
	w: number;
	h: number;
}

export type Handle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
export const HANDLES: ReadonlyArray<Handle> = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export const MIN_SIDE = 5;

/** Rounds to the grid: `step` units (1 = 10 cm, 5 = 50 cm). */
export function snap(value: number, step: number): number {
	const snapped = step <= 1 ? Math.round(value) : Math.round(value / step) * step;
	return snapped === 0 ? 0 : snapped;
}

export function snapPoint(p: Point, step: number): Point {
	return { x: snap(p.x, step), y: snap(p.y, step) };
}

export function isArea(shape: Shape): shape is AreaShape {
	return shape.kind === "room" || shape.kind === "space";
}

export function isPointShape(shape: Shape): shape is PointShape {
	return !isArea(shape);
}

/** The rectangle a drag from `a` to `b` draws, normalised; undefined when a side is under `min` units. */
export function rectFromDrag(
	a: Point,
	b: Point,
	step: number,
	min = MIN_SIDE,
): RectGeometry | undefined {
	const p = snapPoint(a, step);
	const q = snapPoint(b, step);
	const w = Math.abs(q.x - p.x);
	const h = Math.abs(q.y - p.y);
	if (w < min || h < min) return undefined;
	return { type: "rect", x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), w, h };
}

export function rectCorners(r: RectGeometry): ReadonlyArray<Point> {
	return [
		{ x: r.x, y: r.y },
		{ x: r.x + r.w, y: r.y },
		{ x: r.x + r.w, y: r.y + r.h },
		{ x: r.x, y: r.y + r.h },
	];
}

export function cornersOf(g: Geometry): ReadonlyArray<Point> {
	return g.type === "rect" ? rectCorners(g) : g.points;
}

export function boundsOfPoints(points: ReadonlyArray<Point>): Bounds {
	const xs = points.map((p) => p.x);
	const ys = points.map((p) => p.y);
	const x = Math.min(...xs);
	const y = Math.min(...ys);
	return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function boundsOfShape(s: Shape): Bounds {
	if (isArea(s)) return boundsOfPoints(cornersOf(s.geometry));
	const half = s.kind === "device" ? 4 : Math.ceil(s.length / 2);
	const horizontal = s.kind === "device" || s.rotation === 0 || s.rotation === 180;
	return horizontal
		? { x: s.at.x - half, y: s.at.y - 4, w: half * 2, h: 8 }
		: { x: s.at.x - 4, y: s.at.y - half, w: 8, h: half * 2 };
}

export function unionBounds(list: ReadonlyArray<Bounds>): Bounds | undefined {
	if (list.length === 0) return undefined;
	const x = Math.min(...list.map((b) => b.x));
	const y = Math.min(...list.map((b) => b.y));
	const r = Math.max(...list.map((b) => b.x + b.w));
	const b = Math.max(...list.map((q) => q.y + q.h));
	return { x, y, w: r - x, h: b - y };
}

/** Even-odd containment; a point on an edge counts as inside. */
export function pointInPolygon(p: Point, poly: ReadonlyArray<Point>): boolean {
	let inside = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const a = poly[i];
		const b = poly[j];
		if (a === undefined || b === undefined) continue;
		if (distanceToSegment(p, a, b) === 0) return true;
		if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
			inside = !inside;
		}
	}
	return inside;
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const len2 = dx * dx + dy * dy;
	const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
	return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Polygon area in square metres (a unit is 10 cm, so 100 square units are 1 m²). */
export function areaSquareMetres(g: Geometry): number {
	const pts = cornersOf(g);
	let sum = 0;
	for (let i = 0; i < pts.length; i++) {
		const a = pts[i];
		const b = pts[(i + 1) % pts.length];
		if (a !== undefined && b !== undefined) sum += a.x * b.y - b.x * a.y;
	}
	return Math.abs(sum) / 2 / 100;
}

export function centroidOf(g: Geometry): Point {
	const b = boundsOfPoints(cornersOf(g));
	if (g.type === "rect") return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
	const pts = g.points;
	let a2 = 0;
	let cx = 0;
	let cy = 0;
	for (let i = 0; i < pts.length; i++) {
		const p = pts[i];
		const q = pts[(i + 1) % pts.length];
		if (p === undefined || q === undefined) continue;
		const cross = p.x * q.y - q.x * p.y;
		a2 += cross;
		cx += (p.x + q.x) * cross;
		cy += (p.y + q.y) * cross;
	}
	if (a2 === 0) return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
	return { x: cx / (3 * a2), y: cy / (3 * a2) };
}

/** The shape under `p`, topmost (last drawn) first; small things are hit within `tolerance` units. */
export function hitTest(
	shapes: ReadonlyArray<Shape>,
	p: Point,
	tolerance: number,
): Shape | undefined {
	for (let i = shapes.length - 1; i >= 0; i--) {
		const s = shapes[i];
		if (s === undefined) continue;
		if (isPointShape(s)) {
			const b = boundsOfShape(s);
			if (
				p.x >= b.x - tolerance &&
				p.x <= b.x + b.w + tolerance &&
				p.y >= b.y - tolerance &&
				p.y <= b.y + b.h + tolerance
			) {
				return s;
			}
		}
	}
	for (let i = shapes.length - 1; i >= 0; i--) {
		const s = shapes[i];
		if (s !== undefined && isArea(s) && pointInPolygon(p, cornersOf(s.geometry))) return s;
	}
	return undefined;
}

/** True when the click at `p` closes the polygon being drawn: at least three corners and the first one is near. */
export function closesPolygon(points: ReadonlyArray<Point>, p: Point, tolerance: number): boolean {
	const first = points[0];
	return (
		points.length >= 3 &&
		first !== undefined &&
		Math.hypot(p.x - first.x, p.y - first.y) <= tolerance
	);
}

function ccw(a: Point, b: Point, c: Point): number {
	return Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
}

function crosses(a: Point, b: Point, c: Point, d: Point): boolean {
	return ccw(a, b, c) * ccw(a, b, d) < 0 && ccw(c, d, a) * ccw(c, d, b) < 0;
}

/** A polygon may be closed when it has three distinct corners, an area, and no crossing edges. */
export function polygonIsSimple(points: ReadonlyArray<Point>): boolean {
	if (points.length < 3) return false;
	const poly: Geometry = { type: "polygon", points: [...points] };
	if (areaSquareMetres(poly) === 0) return false;
	const n = points.length;
	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			if (j === i + 1 || (i === 0 && j === n - 1)) continue;
			const a = points[i];
			const b = points[(i + 1) % n];
			const c = points[j];
			const d = points[(j + 1) % n];
			if (a && b && c && d && crosses(a, b, c, d)) return false;
		}
	}
	return true;
}

export function translateGeometry(g: Geometry, dx: number, dy: number): Geometry {
	return g.type === "rect"
		? { ...g, x: g.x + dx, y: g.y + dy }
		: { type: "polygon", points: g.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
}

/** Turns an outline 90° clockwise about its bounding box's centre; four turns give the outline back exactly. */
export function rotateGeometry90(g: Geometry): Geometry {
	if (g.type === "rect") {
		return {
			...g,
			w: g.h,
			h: g.w,
			x: g.x + Math.trunc((g.w - g.h) / 2),
			y: g.y + Math.trunc((g.h - g.w) / 2),
		};
	}
	const b = boundsOfPoints(g.points);
	const cx = b.x + Math.trunc(b.w / 2);
	const cy = b.y + Math.trunc(b.h / 2);
	return {
		type: "polygon",
		points: g.points.map((p) => ({ x: cx - (p.y - cy), y: cy + (p.x - cx) })),
	};
}

export function nextRotation(r: Rotation): Rotation {
	return ((r + 90) % 360) as Rotation;
}

/** The rectangle after dragging `handle` by (dx, dy); the opposite edges stay put and a side never drops under `min`. */
export function resizeRect(
	r: RectGeometry,
	handle: Handle,
	dx: number,
	dy: number,
	min = MIN_SIDE,
): RectGeometry {
	let left = r.x;
	let top = r.y;
	let right = r.x + r.w;
	let bottom = r.y + r.h;
	if (handle.includes("w")) left = Math.min(left + dx, right - min);
	if (handle.includes("e")) right = Math.max(right + dx, left + min);
	if (handle.includes("n")) top = Math.min(top + dy, bottom - min);
	if (handle.includes("s")) bottom = Math.max(bottom + dy, top + min);
	return { type: "rect", x: left, y: top, w: right - left, h: bottom - top };
}

export function handlePosition(r: RectGeometry, handle: Handle): Point {
	const cx = r.x + r.w / 2;
	const cy = r.y + r.h / 2;
	const x = handle.includes("w") ? r.x : handle.includes("e") ? r.x + r.w : cx;
	const y = handle.includes("n") ? r.y : handle.includes("s") ? r.y + r.h : cy;
	return { x, y };
}

export interface WallHit {
	at: Point;
	rotation: Rotation;
	/** The area shape whose wall it is. */
	shapeId: string;
}

/** The nearest axis-aligned wall of any room or space within `maxDistance` units, and the point on it; doors and windows sit there. */
export function snapToWall(
	shapes: ReadonlyArray<Shape>,
	p: Point,
	maxDistance: number,
): WallHit | undefined {
	let best: { hit: WallHit; d: number } | undefined;
	for (const s of shapes) {
		if (!isArea(s)) continue;
		const pts = cornersOf(s.geometry);
		for (let i = 0; i < pts.length; i++) {
			const a = pts[i];
			const b = pts[(i + 1) % pts.length];
			if (a === undefined || b === undefined) continue;
			const horizontal = a.y === b.y;
			if (!horizontal && a.x !== b.x) continue;
			const d = distanceToSegment(p, a, b);
			if (d > maxDistance || (best !== undefined && d >= best.d)) continue;
			const at = horizontal
				? { x: Math.round(Math.max(Math.min(a.x, b.x), Math.min(Math.max(a.x, b.x), p.x))), y: a.y }
				: {
						x: a.x,
						y: Math.round(Math.max(Math.min(a.y, b.y), Math.min(Math.max(a.y, b.y), p.y))),
					};
			best = { d, hit: { at, rotation: horizontal ? 0 : 90, shapeId: s.id } };
		}
	}
	return best?.hit;
}

export function boundsOverlap(a: Bounds, b: Bounds): boolean {
	return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
