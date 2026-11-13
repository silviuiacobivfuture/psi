import {
	addFloor as addFloorTo,
	addShape,
	convertKind,
	movePoint,
	moveShapes,
	newId,
	removeFloor,
	removeShapes,
	renameFloor,
	resizeShape,
	rotateShapes,
	setBox,
	updateShape,
} from "../edit";
import {
	boundsOfShape,
	closesPolygon,
	cornersOf,
	HANDLES,
	type Handle,
	isArea,
	polygonIsSimple,
	rectFromDrag,
	resizeRect,
	snap,
	snapPoint,
	snapToWall,
} from "../geometry";
import type { Command } from "../keymap";
import { DEVICE_TYPES, SPACE_TYPES } from "../limits";
import type { DeviceType, FloorPlanDoc, Point, Shape } from "../schema";

/** What the drawing tools need from the page script around them. */
export interface DrawContext {
	doc(): FloorPlanDoc;
	floorId(): string;
	selection(): ReadonlySet<string>;
	step: number;
	/** Pixels per plan unit now (tolerances are in pixels, so they stay the same size at any zoom). */
	scale(): number;
	deviceType(): DeviceType;
	commit(next: FloorPlanDoc, key?: string, selection?: ReadonlySet<string>): void;
	select(ids: ReadonlySet<string>): void;
	ghost(svg: string): void;
	hint(key: string): void;
	floorWord(n: number): string;
	setFloor(id: string): void;
	viewCentre(): Point;
}

export const TOOLS = ["select", "rect", "polygon", "door", "window", "device"] as const;
export type Tool = (typeof TOOLS)[number];

type Drag =
	| { kind: "move"; start: Point; ids: ReadonlySet<string> }
	| { kind: "resize"; start: Point; id: string; handle: Handle }
	| { kind: "vertex"; id: string; index: number }
	| { kind: "rect"; start: Point };

const HANDLE_PX = 14;

function rectSvg(x: number, y: number, w: number, h: number): string {
	return `<rect class="pz-fp__ghost-shape" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
}

export function createDraw(ctx: DrawContext) {
	let tool: Tool = "select";
	let drag: Drag | undefined;
	let points: Point[] = [];
	let hover: Point | undefined;
	let corner: Point | undefined;

	const tolerance = (): number => HANDLE_PX / ctx.scale();
	const floorShapes = (): ReadonlyArray<Shape> =>
		ctx.doc().floors.find((f) => f.id === ctx.floorId())?.shapes ?? [];

	function drawPolygonGhost(): void {
		if (points.length === 0) {
			ctx.ghost("");
			return;
		}
		const all = hover ? [...points, hover] : points;
		const d = all.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
		const dots = points
			.map(
				(p, i) =>
					`<circle class="pz-fp__ghost-dot${i === 0 ? " is-first" : ""}" cx="${p.x}" cy="${p.y}" r="${(i === 0 ? 6 : 3) / ctx.scale()}"/>`,
			)
			.join("");
		ctx.ghost(`<path class="pz-fp__ghost-shape" d="${d}" fill="none"/>${dots}`);
	}

	function setTool(next: Tool): void {
		tool = next;
		drag = undefined;
		points = [];
		corner = undefined;
		hover = undefined;
		ctx.ghost("");
		ctx.hint(
			next === "select"
				? "hintSelect"
				: next === "rect"
					? "hintRect"
					: next === "polygon"
						? "hintPolygon"
						: next === "door"
							? "hintDoor"
							: next === "window"
								? "hintWindow"
								: "hintDevice",
		);
	}

	function addRect(a: Point, b: Point): boolean {
		const g = rectFromDrag(a, b, ctx.step);
		const d = ctx.doc();
		if (g === undefined || g.x < 0 || g.y < 0 || g.x + g.w > d.width || g.y + g.h > d.height)
			return false;
		const id = newId(d, "room");
		const next = addShape(d, ctx.floorId(), { id, kind: "room", label: "", geometry: g });
		ctx.commit(next, undefined, new Set([id]));
		return next !== d;
	}

	function finishPolygon(): void {
		if (!polygonIsSimple(points)) return;
		const d = ctx.doc();
		const id = newId(d, "room");
		const next = addShape(d, ctx.floorId(), {
			id,
			kind: "room",
			label: "",
			geometry: { type: "polygon", points },
		});
		points = [];
		ctx.ghost("");
		ctx.commit(next, undefined, new Set([id]));
	}

	/** A press: returns "drag" when this module follows the pointer, "pan" when the page may pan with it (and calls `click` if it did not move). */
	function down(target: Element | null, w: Point, shift: boolean): "drag" | "pan" {
		if (tool === "select") {
			const handle = target?.closest("[data-handle],[data-vertex]");
			if (handle instanceof SVGElement) {
				const id = handle.getAttribute("data-for") ?? "";
				const hv = handle.getAttribute("data-vertex");
				const hh = handle.getAttribute("data-handle");
				if (hv !== null) drag = { kind: "vertex", id, index: Number(hv) };
				else {
					const handleName = HANDLES.find((x) => x === hh);
					if (handleName !== undefined) drag = { kind: "resize", start: w, id, handle: handleName };
				}
				return drag ? "drag" : "pan";
			}
			const el = target?.closest("[data-shape-id]");
			const id = el?.getAttribute("data-shape-id");
			if (id) {
				let ids = new Set(ctx.selection());
				if (shift) {
					if (ids.has(id)) ids.delete(id);
					else ids.add(id);
				} else if (!ids.has(id)) ids = new Set([id]);
				ctx.select(ids);
				drag = { kind: "move", start: w, ids };
				return "drag";
			}
			return "pan";
		}
		if (tool === "rect") {
			drag = { kind: "rect", start: w };
			return "drag";
		}
		return "pan";
	}

	function move(w: Point): void {
		if (drag?.kind === "move") {
			const dx = snap(w.x - drag.start.x, ctx.step);
			const dy = snap(w.y - drag.start.y, ctx.step);
			const moved = moveShapes(ctx.doc(), drag.ids, dx, dy);
			const parts: string[] = [];
			for (const s of floorShapes()) {
				if (!drag.ids.has(s.id)) continue;
				const m = moved.floors.flatMap((f) => f.shapes).find((x) => x.id === s.id);
				if (m === undefined) continue;
				const b = boundsOfShape(m);
				parts.push(rectSvg(b.x, b.y, b.w, b.h));
			}
			ctx.ghost(parts.join(""));
		} else if (drag?.kind === "resize") {
			const s = floorShapes().find((x) => x.id === (drag as { id: string }).id);
			if (s && isArea(s) && s.geometry.type === "rect") {
				const r = resizeRect(
					s.geometry,
					drag.handle,
					snap(w.x - drag.start.x, ctx.step),
					snap(w.y - drag.start.y, ctx.step),
				);
				ctx.ghost(rectSvg(r.x, r.y, r.w, r.h));
			}
		} else if (drag?.kind === "vertex") {
			const dragging = drag;
			const s = floorShapes().find((x) => x.id === dragging.id);
			if (s && isArea(s) && s.geometry.type === "polygon") {
				const p = snapPoint(w, ctx.step);
				const idx = drag.index;
				const pts = s.geometry.points.map((q, i) => (i === idx ? p : q));
				ctx.ghost(
					`<path class="pz-fp__ghost-shape" fill="none" d="${pts.map((q, i) => `${i === 0 ? "M" : "L"}${q.x} ${q.y}`).join(" ")} Z"/>`,
				);
			}
		} else if (drag?.kind === "rect") {
			const r = rectFromDrag(drag.start, w, ctx.step, 1);
			ctx.ghost(r ? rectSvg(r.x, r.y, r.w, r.h) : "");
		} else if (tool === "rect" && corner) {
			const r = rectFromDrag(corner, w, ctx.step, 1);
			ctx.ghost(r ? rectSvg(r.x, r.y, r.w, r.h) : "");
		} else if (tool === "polygon" && points.length > 0) {
			hover = snapPoint(w, ctx.step);
			drawPolygonGhost();
		}
	}

	function up(w: Point, moved: boolean): void {
		const d = drag;
		drag = undefined;
		ctx.ghost("");
		if (d === undefined) return;
		const doc = ctx.doc();
		if (d.kind === "move") {
			if (moved)
				ctx.commit(
					moveShapes(doc, d.ids, snap(w.x - d.start.x, ctx.step), snap(w.y - d.start.y, ctx.step)),
				);
		} else if (d.kind === "resize") {
			if (moved)
				ctx.commit(
					resizeShape(
						doc,
						d.id,
						d.handle,
						snap(w.x - d.start.x, ctx.step),
						snap(w.y - d.start.y, ctx.step),
					),
				);
		} else if (d.kind === "vertex") {
			ctx.commit(movePoint(doc, d.id, d.index, snapPoint(w, ctx.step)));
		} else if (moved) {
			corner = undefined;
			addRect(d.start, w);
		} else if (corner) {
			const first = corner;
			corner = undefined;
			addRect(first, w);
			ctx.hint("hintRect");
		} else {
			corner = snapPoint(d.start, ctx.step);
			ctx.hint("hintRectSecond");
		}
	}

	/** A click that did not drag (the page calls it for the tools that place things). */
	function click(target: Element | null, w: Point): void {
		const doc = ctx.doc();
		if (tool === "select") {
			if (ctx.selection().size > 0) ctx.select(new Set());
		} else if (tool === "polygon") {
			const p = snapPoint(w, ctx.step);
			if (closesPolygon(points, p, tolerance())) finishPolygon();
			else {
				points.push(p);
				drawPolygonGhost();
			}
		} else if (tool === "door" || tool === "window") {
			const hit = snapToWall(floorShapes(), w, tolerance() * 1.5);
			if (hit === undefined) return;
			const id = newId(doc, tool);
			const shape: Shape =
				tool === "door"
					? {
							id,
							kind: "door",
							label: "",
							at: hit.at,
							length: 9,
							rotation: hit.rotation,
							swing: "left",
						}
					: { id, kind: "window", label: "", at: hit.at, length: 12, rotation: hit.rotation };
			ctx.commit(addShape(doc, ctx.floorId(), shape), undefined, new Set([id]));
		} else if (tool === "device") {
			const p = snapPoint(w, 1);
			const id = newId(doc, "device");
			ctx.commit(
				addShape(doc, ctx.floorId(), {
					id,
					kind: "device",
					label: "",
					at: p,
					rotation: 0,
					deviceType: ctx.deviceType(),
				}),
				undefined,
				new Set([id]),
			);
		}
		void target;
	}

	function addRoomHere(): void {
		const c = ctx.viewCentre();
		const d = ctx.doc();
		const x = Math.max(0, Math.min(d.width - 30, snap(c.x - 15, ctx.step)));
		const y = Math.max(0, Math.min(d.height - 30, snap(c.y - 15, ctx.step)));
		addRect({ x, y }, { x: x + 30, y: y + 30 });
	}

	/** Runs a keyboard or button command; true when it did something that the page should not do itself. */
	function run(cmd: Command): boolean {
		const doc = ctx.doc();
		const ids = ctx.selection();
		switch (cmd.type) {
			case "nudge":
				if (ids.size === 0) return false;
				ctx.commit(moveShapes(doc, ids, cmd.dx, cmd.dy), `nudge:${[...ids].sort().join(",")}`);
				return true;
			case "resize": {
				const only = ids.size === 1 ? [...ids][0] : undefined;
				if (only === undefined) return false;
				ctx.commit(resizeShape(doc, only, "se", cmd.dx, cmd.dy), `resize:${only}`);
				return true;
			}
			case "delete":
				if (ids.size === 0) return false;
				ctx.commit(removeShapes(doc, ids), undefined, new Set());
				return true;
			case "rotate":
				if (ids.size === 0) return false;
				ctx.commit(rotateShapes(doc, ids));
				return true;
			case "selectAll":
				ctx.select(new Set(floorShapes().map((s) => s.id)));
				return true;
			case "cancel":
				if (points.length > 0 || corner || drag) {
					points = [];
					corner = undefined;
					drag = undefined;
					ctx.ghost("");
					return true;
				}
				if (tool !== "select") {
					setTool("select");
					return true;
				}
				if (ids.size > 0) {
					ctx.select(new Set());
					return true;
				}
				return false;
			case "finish":
				finishPolygon();
				return true;
			case "backPoint":
				points.pop();
				drawPolygonGhost();
				return true;
			case "tool":
				setTool(cmd.tool);
				return true;
			case "undo":
			case "redo":
			case "fit":
			case "zoom":
				return false;
			default: {
				const never: never = cmd;
				return never;
			}
		}
	}

	/** What one inspector field does to the plan; the same document when it changes nothing. */
	function fieldEdit(name: string, id: string | null, value: string): FloorPlanDoc {
		const doc = ctx.doc();
		const units = Math.round(Number(value) * 10);
		if (name === "floorName") return renameFloor(doc, ctx.floorId(), value);
		if (id === null) return doc;
		const none = value === "" ? undefined : value;
		switch (name) {
			case "label":
				return updateShape(doc, id, { label: value.slice(0, 60) });
			case "roomId":
				return updateShape(doc, id, { roomId: none });
			case "deviceId":
				return updateShape(doc, id, { deviceId: none });
			case "spaceType": {
				const t = SPACE_TYPES.find((x) => x === value);
				return t === undefined ? doc : updateShape(doc, id, { spaceType: t });
			}
			case "deviceType": {
				const t = DEVICE_TYPES.find((x) => x === value);
				return t === undefined ? doc : updateShape(doc, id, { deviceType: t });
			}
			case "swing":
				return updateShape(doc, id, { swing: value === "right" ? "right" : "left" });
			case "kind":
				return convertKind(doc, id, value === "space" ? "space" : "room");
			case "length":
				return updateShape(doc, id, { length: units });
			case "x":
			case "y":
			case "w":
			case "h":
				return Number.isFinite(Number(value)) && value !== ""
					? setBox(doc, id, { [name]: units })
					: doc;
			default:
				return doc;
		}
	}

	/** One inspector field changed. */
	function field(name: string, id: string | null, value: string): void {
		ctx.commit(fieldEdit(name, id, value), name === "label" && id ? `label:${id}` : undefined);
	}

	function addFloor(): void {
		const d = ctx.doc();
		const next = addFloorTo(d, ctx.floorWord(d.floors.length + 1));
		const created = next.floors[next.floors.length - 1];
		ctx.commit(next, undefined, new Set());
		if (created && next !== d) ctx.setFloor(created.id);
	}

	function dropFloor(): void {
		const d = ctx.doc();
		const next = removeFloor(d, ctx.floorId());
		if (next === d) return;
		const first = next.floors[0];
		ctx.commit(next, undefined, new Set());
		if (first) ctx.setFloor(first.id);
	}

	return {
		down,
		move,
		up,
		click,
		run,
		field,
		addFloor,
		dropFloor,
		addRoomHere,
		setTool,
		get tool(): Tool {
			return tool;
		},
		get drawing(): boolean {
			return tool === "polygon" && points.length > 0;
		},
		cornersOf,
	};
}
