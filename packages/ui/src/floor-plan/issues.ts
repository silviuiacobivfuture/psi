import {
	boundsOfShape,
	boundsOverlap,
	centroidOf,
	cornersOf,
	distanceToSegment,
	isArea,
	pointInPolygon,
} from "./geometry";
import type { AreaShape, FloorPlanDoc, PlanIssue, Point } from "./schema";

function strictlyInside(p: Point, s: AreaShape): boolean {
	const pts = cornersOf(s.geometry);
	if (!pointInPolygon(p, pts)) return false;
	return !pts.some((a, i) => {
		const b = pts[(i + 1) % pts.length];
		return b !== undefined && distanceToSegment(p, a, b) === 0;
	});
}

/** Two outlines overlap when their interiors share area; walls that only touch do not. */
export function areasOverlap(a: AreaShape, b: AreaShape): boolean {
	const ba = boundsOfShape(a);
	const bb = boundsOfShape(b);
	if (!boundsOverlap(ba, bb)) return false;
	if (a.geometry.type === "rect" && b.geometry.type === "rect") return true;
	const ca = cornersOf(a.geometry);
	const cb = cornersOf(b.geometry);
	const mid = (s: AreaShape): Point => {
		const c = centroidOf(s.geometry);
		return { x: Math.round(c.x), y: Math.round(c.y) };
	};
	return (
		ca.some((p) => strictlyInside(p, b)) ||
		cb.some((p) => strictlyInside(p, a)) ||
		strictlyInside(mid(a), b) ||
		strictlyInside(mid(b), a)
	);
}

/**
 * What a plan says wrong against the store's room list. An outline pointing at a room the store
 * does not have is an ERROR (a save is refused); two outlines sharing floor area is a WARNING
 * (a mezzanine or an L-shaped room drawn from two rectangles is legitimate). One room may own
 * several outlines.
 */
export function planIssues(
	doc: FloorPlanDoc,
	rooms: ReadonlyArray<{ id: string }>,
): ReadonlyArray<PlanIssue> {
	const known = new Set(rooms.map((r) => r.id));
	const issues: PlanIssue[] = [];
	for (const floor of doc.floors) {
		const areas = floor.shapes.filter(isArea);
		for (const s of areas) {
			if (s.kind === "room" && s.roomId !== undefined && !known.has(s.roomId)) {
				issues.push({ code: "unknown-room", shapeId: s.id, severity: "error" });
			}
		}
		for (let i = 0; i < areas.length; i++) {
			for (let j = i + 1; j < areas.length; j++) {
				const a = areas[i];
				const b = areas[j];
				if (a && b && areasOverlap(a, b)) {
					issues.push({ code: "overlap", shapeId: a.id, other: b.id, severity: "warning" });
				}
			}
		}
	}
	return issues;
}

export function hasBlockingIssue(issues: ReadonlyArray<PlanIssue>): boolean {
	return issues.some((i) => i.severity === "error");
}
