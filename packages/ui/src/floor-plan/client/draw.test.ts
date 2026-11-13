// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { doc as base } from "../demo-fixture";
import { findShape } from "../edit";
import type { FloorPlanDoc } from "../schema";
import { createDraw, type DrawContext } from "./draw";

/** The tools against a fake page: it records what they commit, select and say. */
function rig(initial: FloorPlanDoc = base) {
	const state = {
		doc: initial,
		sel: new Set<string>(),
		hints: [] as string[],
		commits: 0,
		floor: "f1",
		ghost: "",
	};
	const ctx: DrawContext = {
		doc: () => state.doc,
		floorId: () => state.floor,
		selection: () => state.sel,
		step: 5,
		scale: () => 5,
		deviceType: () => "hemisync-headphones",
		commit: (next, _k, sel) => {
			if (next !== state.doc) state.commits++;
			state.doc = next;
			if (sel) state.sel = new Set(sel);
		},
		select: (ids) => (state.sel = new Set(ids)),
		ghost: (s) => (state.ghost = s),
		hint: (k) => state.hints.push(k),
		floorWord: (n) => `Etaj ${n}`,
		setFloor: (id) => (state.floor = id),
		viewCentre: () => ({ x: 100, y: 80 }),
	};
	return { state, tools: createDraw(ctx) };
}
const shapes = (d: FloorPlanDoc) => d.floors.flatMap((f) => f.shapes);

describe("drawing tools", () => {
	it("a drag with the rectangle tool adds a snapped room and selects it", () => {
		const { state, tools } = rig();
		tools.setTool("rect");
		expect(tools.down(null, { x: 121, y: 71 }, false)).toBe("drag");
		tools.move({ x: 162, y: 99 });
		expect(state.ghost).toContain("<rect");
		tools.up({ x: 162, y: 99 }, true);
		const added = shapes(state.doc).at(-1);
		expect(added).toMatchObject({
			kind: "room",
			geometry: { type: "rect", x: 120, y: 70, w: 40, h: 30 },
		});
		expect(state.sel.size).toBe(1);
		expect(state.ghost).toBe("");
	});
	it("two clicks do the same without dragging, and the second asks for the corner", () => {
		const { state, tools } = rig();
		tools.setTool("rect");
		tools.down(null, { x: 120, y: 70 }, false);
		tools.up({ x: 120, y: 70 }, false);
		expect(state.hints.at(-1)).toBe("hintRectSecond");
		tools.down(null, { x: 160, y: 100 }, false);
		tools.up({ x: 160, y: 100 }, false);
		expect(shapes(state.doc).at(-1)).toMatchObject({ geometry: { x: 120, y: 70, w: 40, h: 30 } });
	});
	it("a rectangle under the minimum, or outside the drawing area, adds nothing", () => {
		const { state, tools } = rig();
		tools.setTool("rect");
		tools.down(null, { x: 120, y: 70 }, false);
		tools.up({ x: 122, y: 90 }, true);
		tools.down(null, { x: 150, y: 70 }, false);
		tools.up({ x: 400, y: 100 }, true);
		expect(state.commits).toBe(0);
	});
	it("the polygon tool collects points, closes on the first one and refuses a bow-tie", () => {
		const { state, tools } = rig();
		tools.setTool("polygon");
		for (const p of [
			{ x: 130, y: 70 },
			{ x: 180, y: 70 },
			{ x: 180, y: 110 },
		])
			tools.click(null, p);
		expect(tools.drawing).toBe(true);
		tools.click(null, { x: 131, y: 71 });
		expect(shapes(state.doc).at(-1)).toMatchObject({
			kind: "room",
			geometry: {
				type: "polygon",
				points: [
					{ x: 130, y: 70 },
					{ x: 180, y: 70 },
					{ x: 180, y: 110 },
				],
			},
		});
		expect(tools.drawing).toBe(false);
		const bow = rig();
		bow.tools.setTool("polygon");
		for (const p of [
			{ x: 130, y: 70 },
			{ x: 180, y: 110 },
			{ x: 180, y: 70 },
			{ x: 130, y: 110 },
		])
			bow.tools.click(null, p);
		bow.tools.run({ type: "finish" });
		expect(bow.state.commits).toBe(0);
	});
	it("Escape cancels a polygon in progress, then the tool, then the selection; Backspace drops the last point", () => {
		const { state, tools } = rig();
		tools.setTool("polygon");
		tools.click(null, { x: 130, y: 70 });
		tools.click(null, { x: 180, y: 70 });
		tools.run({ type: "backPoint" });
		tools.run({ type: "backPoint" });
		expect(tools.drawing).toBe(false);
		tools.click(null, { x: 130, y: 70 });
		expect(tools.run({ type: "cancel" })).toBe(true);
		expect(tools.drawing).toBe(false);
		expect(tools.tool).toBe("polygon");
		tools.run({ type: "cancel" });
		expect(tools.tool).toBe("select");
		state.sel = new Set(["a"]);
		expect(tools.run({ type: "cancel" })).toBe(true);
		expect(state.sel.size).toBe(0);
		expect(tools.run({ type: "cancel" })).toBe(false);
	});
	it("a door snaps to the nearest wall and takes its orientation; far from any wall nothing is added", () => {
		const { state, tools } = rig();
		tools.setTool("door");
		tools.click(null, { x: 33, y: 11 });
		expect(shapes(state.doc).at(-1)).toMatchObject({
			kind: "door",
			at: { x: 33, y: 10 },
			rotation: 0,
		});
		tools.click(null, { x: 35, y: 30 });
		expect(state.commits).toBe(1);
		tools.setTool("window");
		tools.click(null, { x: 61, y: 30 });
		expect(shapes(state.doc).at(-1)).toMatchObject({ kind: "window", rotation: 90 });
	});
	it("the device tool places the chosen type", () => {
		const { state, tools } = rig();
		tools.setTool("device");
		tools.click(null, { x: 80, y: 30 });
		expect(shapes(state.doc).at(-1)).toMatchObject({
			kind: "device",
			deviceType: "hemisync-headphones",
			at: { x: 80, y: 30 },
		});
	});
	it("dragging a selected shape moves the selection by a snapped delta; a press without movement moves nothing", () => {
		const { state, tools } = rig();
		const el = document.createElementNS("http://www.w3.org/2000/svg", "g");
		el.setAttribute("data-shape-id", "a");
		expect(tools.down(el, { x: 30, y: 30 }, false)).toBe("drag");
		tools.move({ x: 52, y: 38 });
		tools.up({ x: 52, y: 38 }, true);
		expect(findShape(state.doc, "a")).toMatchObject({ geometry: { x: 30, y: 20 } });
		const none = rig();
		none.tools.down(el, { x: 30, y: 30 }, false);
		none.tools.up({ x: 30, y: 30 }, false);
		expect(none.state.commits).toBe(0);
	});
	it("shift adds to the selection and removes again", () => {
		const { state, tools } = rig();
		const mk = (id: string) => {
			const e = document.createElementNS("http://www.w3.org/2000/svg", "g");
			e.setAttribute("data-shape-id", id);
			return e;
		};
		tools.down(mk("a"), { x: 0, y: 0 }, false);
		tools.up({ x: 0, y: 0 }, false);
		tools.down(mk("b"), { x: 0, y: 0 }, true);
		tools.up({ x: 0, y: 0 }, false);
		expect([...state.sel].sort()).toEqual(["a", "b"]);
		tools.down(mk("a"), { x: 0, y: 0 }, true);
		tools.up({ x: 0, y: 0 }, false);
		expect([...state.sel]).toEqual(["b"]);
	});
	it("a handle drag resizes with the opposite edge fixed", () => {
		const { state, tools } = rig();
		const h = document.createElementNS("http://www.w3.org/2000/svg", "g");
		h.setAttribute("data-handle", "se");
		h.setAttribute("data-for", "a");
		expect(tools.down(h, { x: 60, y: 50 }, false)).toBe("drag");
		tools.up({ x: 80, y: 65 }, true);
		expect(findShape(state.doc, "a")).toMatchObject({ geometry: { x: 10, y: 10, w: 70, h: 55 } });
	});
	it("commands: nudge by one unit or a metre, rotate, delete, select all; none do anything with nothing selected", () => {
		const { state, tools } = rig();
		expect(tools.run({ type: "nudge", dx: 1, dy: 0 })).toBe(false);
		expect(tools.run({ type: "delete" })).toBe(false);
		tools.run({ type: "selectAll" });
		expect(state.sel.size).toBe(4);
		state.sel = new Set(["a"]);
		tools.run({ type: "nudge", dx: 10, dy: 1 });
		expect(findShape(state.doc, "a")).toMatchObject({ geometry: { x: 20, y: 11 } });
		tools.run({ type: "rotate" });
		expect(findShape(state.doc, "a")).toMatchObject({ geometry: { w: 40, h: 50 } });
		tools.run({ type: "resize", dx: 5, dy: 0 });
		tools.run({ type: "delete" });
		expect(findShape(state.doc, "a")).toBeUndefined();
		expect(state.sel.size).toBe(0);
	});
	it("inspector fields: label, room, metres to units, kind; a bad number changes nothing", () => {
		const { state, tools } = rig();
		tools.field("label", "a", "Sală");
		tools.field("roomId", "a", "psih-1");
		tools.field("x", "a", "2.0");
		tools.field("w", "a", "4.5");
		expect(findShape(state.doc, "a")).toMatchObject({
			label: "Sală",
			roomId: "psih-1",
			geometry: { x: 20, w: 45 },
		});
		const n = state.commits;
		tools.field("x", "a", "abc");
		tools.field("x", "a", "");
		tools.field("w", "a", "0.1");
		expect(state.commits).toBe(n);
		tools.field("kind", "a", "space");
		expect(findShape(state.doc, "a")).toMatchObject({ kind: "space", spaceType: "other" });
	});
	it("floors: add selects the new floor, remove goes back, the last one stays", () => {
		const { state, tools } = rig();
		tools.addFloor();
		expect(state.doc.floors).toHaveLength(2);
		expect(state.floor).toBe(state.doc.floors[1]?.id);
		tools.dropFloor();
		expect(state.doc.floors).toHaveLength(1);
		tools.dropFloor();
		expect(state.doc.floors).toHaveLength(1);
		tools.field("floorName", null, "Subsol");
		expect(state.doc.floors[0]?.name).toBe("Subsol");
	});
	it("a room can be added without dragging, at the middle of the view", () => {
		const { state, tools } = rig();
		tools.addRoomHere();
		expect(shapes(state.doc).at(-1)).toMatchObject({ geometry: { w: 30, h: 30, x: 85, y: 65 } });
	});
});
