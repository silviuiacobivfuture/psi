import {
	boundsOfShape,
	type Handle,
	isArea,
	MIN_SIDE,
	nextRotation,
	resizeRect,
	rotateGeometry90,
	translateGeometry,
	unionBounds,
} from "./geometry";
import { MAX_FLOORS, MAX_POLYGON_POINTS, MAX_SHAPES_PER_FLOOR } from "./limits";
import type { Floor, FloorPlanDoc, Point, Shape } from "./schema";

/** Every pure edit of a plan. Each returns a new document, or the same one (by reference) when nothing changed. */

export function floorOf(doc: FloorPlanDoc, floorId: string): Floor | undefined {
	return doc.floors.find((f) => f.id === floorId);
}

export function findShape(doc: FloorPlanDoc, id: string): Shape | undefined {
	for (const f of doc.floors) {
		const s = f.shapes.find((x) => x.id === id);
		if (s !== undefined) return s;
	}
	return undefined;
}

function mapFloor(doc: FloorPlanDoc, floorId: string, fn: (f: Floor) => Floor): FloorPlanDoc {
	let changed = false;
	const floors = doc.floors.map((f) => {
		if (f.id !== floorId) return f;
		const next = fn(f);
		if (next !== f) changed = true;
		return next;
	});
	return changed ? { ...doc, floors } : doc;
}

function mapShapes(
	doc: FloorPlanDoc,
	ids: ReadonlySet<string>,
	fn: (s: Shape) => Shape,
): FloorPlanDoc {
	let changed = false;
	const floors = doc.floors.map((f) => {
		let touched = false;
		const shapes = f.shapes.map((s) => {
			if (!ids.has(s.id)) return s;
			const next = fn(s);
			if (next !== s) touched = true;
			return next;
		});
		if (!touched) return f;
		changed = true;
		return { ...f, shapes };
	});
	return changed ? { ...doc, floors } : doc;
}

/** The next free id with `prefix`: "room-1", "room-2", … never one the plan already holds. */
export function newId(doc: FloorPlanDoc, prefix: string): string {
	const taken = new Set(doc.floors.flatMap((f) => [f.id, ...f.shapes.map((s) => s.id)]));
	let n = 1;
	while (taken.has(`${prefix}-${n}`)) n++;
	return `${prefix}-${n}`;
}

/** Adds a shape to a floor; refused (same document) when the floor is full or the id is taken. */
export function addShape(doc: FloorPlanDoc, floorId: string, shape: Shape): FloorPlanDoc {
	const taken = doc.floors.some(
		(f) => f.id === shape.id || f.shapes.some((s) => s.id === shape.id),
	);
	if (taken) return doc;
	return mapFloor(doc, floorId, (f) =>
		f.shapes.length >= MAX_SHAPES_PER_FLOOR ? f : { ...f, shapes: [...f.shapes, shape] },
	);
}

export function removeShapes(doc: FloorPlanDoc, ids: ReadonlySet<string>): FloorPlanDoc {
	let changed = false;
	const floors = doc.floors.map((f) => {
		const shapes = f.shapes.filter((s) => !ids.has(s.id));
		if (shapes.length === f.shapes.length) return f;
		changed = true;
		return { ...f, shapes };
	});
	return changed ? { ...doc, floors } : doc;
}

/** Keeps a group of shapes inside the drawing area by shortening the move. */
function clampMove(doc: FloorPlanDoc, shapes: ReadonlyArray<Shape>, dx: number, dy: number): Point {
	const b = unionBounds(shapes.map(boundsOfShape));
	if (b === undefined) return { x: 0, y: 0 };
	return {
		x: Math.max(-b.x, Math.min(doc.width - (b.x + b.w), dx)),
		y: Math.max(-b.y, Math.min(doc.height - (b.y + b.h), dy)),
	};
}

export function moveShapes(
	doc: FloorPlanDoc,
	ids: ReadonlySet<string>,
	dx: number,
	dy: number,
): FloorPlanDoc {
	const chosen = doc.floors.flatMap((f) => f.shapes).filter((s) => ids.has(s.id));
	const d = clampMove(doc, chosen, dx, dy);
	if (d.x === 0 && d.y === 0) return doc;
	return mapShapes(doc, ids, (s) =>
		isArea(s)
			? { ...s, geometry: translateGeometry(s.geometry, d.x, d.y) }
			: { ...s, at: { x: s.at.x + d.x, y: s.at.y + d.y } },
	);
}

export function rotateShapes(doc: FloorPlanDoc, ids: ReadonlySet<string>): FloorPlanDoc {
	return mapShapes(doc, ids, (s) => {
		if (isArea(s)) return { ...s, geometry: rotateGeometry90(s.geometry) };
		return { ...s, rotation: nextRotation(s.rotation) };
	});
}

/** Drags a rectangle's handle; shapes that are not rectangles, or would leave the area, stay as they are. */
export function resizeShape(
	doc: FloorPlanDoc,
	id: string,
	handle: Handle,
	dx: number,
	dy: number,
): FloorPlanDoc {
	return mapShapes(doc, new Set([id]), (s) => {
		if (!isArea(s) || s.geometry.type !== "rect") return s;
		const g = resizeRect(s.geometry, handle, dx, dy);
		const inside = g.x >= 0 && g.y >= 0 && g.x + g.w <= doc.width && g.y + g.h <= doc.height;
		return inside ? { ...s, geometry: g } : s;
	});
}

/** Moves one corner of a polygon. */
export function movePoint(doc: FloorPlanDoc, id: string, index: number, to: Point): FloorPlanDoc {
	return mapShapes(doc, new Set([id]), (s) => {
		if (!isArea(s) || s.geometry.type !== "polygon") return s;
		if (
			index < 0 ||
			index >= s.geometry.points.length ||
			to.x < 0 ||
			to.y < 0 ||
			to.x > doc.width ||
			to.y > doc.height
		)
			return s;
		return {
			...s,
			geometry: {
				type: "polygon",
				points: s.geometry.points.map((p, i) => (i === index ? to : p)),
			},
		};
	});
}

/** Adds a corner to a polygon after `index` (used to cut a corner or add a notch); refused over 64 corners. */
export function insertPoint(doc: FloorPlanDoc, id: string, index: number, at: Point): FloorPlanDoc {
	return mapShapes(doc, new Set([id]), (s) => {
		if (
			!isArea(s) ||
			s.geometry.type !== "polygon" ||
			s.geometry.points.length >= MAX_POLYGON_POINTS
		)
			return s;
		const pts = [...s.geometry.points];
		pts.splice(index + 1, 0, at);
		return { ...s, geometry: { type: "polygon", points: pts } };
	});
}

/** What an inspector may change on a shape, by name. */
export type ShapePatch = Partial<{
	label: string;
	roomId: string | undefined;
	spaceType: Extract<Shape, { kind: "space" }>["spaceType"];
	deviceType: Extract<Shape, { kind: "device" }>["deviceType"];
	deviceId: string | undefined;
	swing: "left" | "right";
	length: number;
}>;

export function updateShape(doc: FloorPlanDoc, id: string, patch: ShapePatch): FloorPlanDoc {
	return mapShapes(doc, new Set([id]), (s) => {
		const next: Shape = { ...s };
		if (patch.label !== undefined) next.label = patch.label;
		if (next.kind === "room" && "roomId" in patch) {
			if (patch.roomId === undefined) delete next.roomId;
			else next.roomId = patch.roomId;
		}
		if (next.kind === "space" && patch.spaceType !== undefined) next.spaceType = patch.spaceType;
		if (next.kind === "device") {
			if (patch.deviceType !== undefined) next.deviceType = patch.deviceType;
			if ("deviceId" in patch) {
				if (patch.deviceId === undefined) delete next.deviceId;
				else next.deviceId = patch.deviceId;
			}
		}
		if (next.kind === "door" && patch.swing !== undefined) next.swing = patch.swing;
		if ((next.kind === "door" || next.kind === "window") && patch.length !== undefined)
			next.length = patch.length;
		return next;
	});
}

export function addFloor(doc: FloorPlanDoc, name: string): FloorPlanDoc {
	if (doc.floors.length >= MAX_FLOORS) return doc;
	return { ...doc, floors: [...doc.floors, { id: newId(doc, "floor"), name, shapes: [] }] };
}

export function renameFloor(doc: FloorPlanDoc, floorId: string, name: string): FloorPlanDoc {
	return mapFloor(doc, floorId, (f) =>
		name.length === 0 || name === f.name ? f : { ...f, name: name.slice(0, 40) },
	);
}

/** Removes a floor with its shapes; the last floor is never removed. */
export function removeFloor(doc: FloorPlanDoc, floorId: string): FloorPlanDoc {
	if (doc.floors.length <= 1 || !doc.floors.some((f) => f.id === floorId)) return doc;
	return { ...doc, floors: doc.floors.filter((f) => f.id !== floorId) };
}

/** What the inspector's number fields may set, in units. Areas take x, y (and w, h for rectangles); points take x, y. */
export type BoxPatch = Partial<{ x: number; y: number; w: number; h: number }>;

/** Sets a shape's position and size from typed numbers; refused (same document) outside the drawing area or under the minimum side. */
export function setBox(doc: FloorPlanDoc, id: string, patch: BoxPatch): FloorPlanDoc {
	const current = findShape(doc, id);
	if (current === undefined) return doc;
	const b = isArea(current)
		? boundsOfShape(current)
		: { x: current.at.x, y: current.at.y, w: 0, h: 0 };
	const x = patch.x ?? b.x;
	const y = patch.y ?? b.y;
	if (!isArea(current)) {
		if (x < 0 || y < 0 || x > doc.width || y > doc.height) return doc;
		return mapShapes(doc, new Set([id]), (s) => (isArea(s) ? s : { ...s, at: { x, y } }));
	}
	if (current.geometry.type === "polygon") {
		return x === b.x && y === b.y ? doc : moveShapes(doc, new Set([id]), x - b.x, y - b.y);
	}
	const w = patch.w ?? current.geometry.w;
	const h = patch.h ?? current.geometry.h;
	if (w < MIN_SIDE || h < MIN_SIDE || x < 0 || y < 0 || x + w > doc.width || y + h > doc.height)
		return doc;
	if (x === b.x && y === b.y && w === current.geometry.w && h === current.geometry.h) return doc;
	return mapShapes(doc, new Set([id]), (s) =>
		isArea(s) ? { ...s, geometry: { type: "rect", x, y, w, h } } : s,
	);
}

/** Turns a bookable room into a non-bookable space and back; the geometry and the label stay. */
export function convertKind(doc: FloorPlanDoc, id: string, kind: "room" | "space"): FloorPlanDoc {
	return mapShapes(doc, new Set([id]), (s) => {
		if (!isArea(s) || s.kind === kind) return s;
		return kind === "space"
			? { id: s.id, kind: "space", label: s.label, geometry: s.geometry, spaceType: "other" }
			: { id: s.id, kind: "room", label: s.label, geometry: s.geometry };
	});
}
