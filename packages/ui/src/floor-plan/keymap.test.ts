import { describe, expect, it } from "vitest";
import { type Command, commandFor, type KeyContext, type KeyInput } from "./keymap";

const k = (key: string, over: Partial<KeyInput> = {}): KeyInput => ({
	key,
	ctrl: false,
	meta: false,
	shift: false,
	alt: false,
	...over,
});
const idle: KeyContext = { typing: false, drawing: false };
const drawing: KeyContext = { typing: false, drawing: true };

describe("keyboard map", () => {
	it.each<[string, KeyInput, Command]>([
		["arrow nudges 10 cm", k("ArrowLeft"), { type: "nudge", dx: -1, dy: 0 }],
		["arrow up", k("ArrowUp"), { type: "nudge", dx: 0, dy: -1 }],
		["Shift+arrow nudges 1 m", k("ArrowRight", { shift: true }), { type: "nudge", dx: 10, dy: 0 }],
		["Shift+arrow down", k("ArrowDown", { shift: true }), { type: "nudge", dx: 0, dy: 10 }],
		["Alt+arrow resizes", k("ArrowRight", { alt: true }), { type: "resize", dx: 1, dy: 0 }],
		[
			"Alt+Shift+arrow resizes by a metre",
			k("ArrowDown", { alt: true, shift: true }),
			{ type: "resize", dx: 0, dy: 10 },
		],
		["Delete", k("Delete"), { type: "delete" }],
		["Backspace deletes when not drawing", k("Backspace"), { type: "delete" }],
		["Ctrl+Z undoes", k("z", { ctrl: true }), { type: "undo" }],
		["Cmd+Z undoes", k("z", { meta: true }), { type: "undo" }],
		["Ctrl+Y redoes", k("y", { ctrl: true }), { type: "redo" }],
		["Ctrl+Shift+Z redoes", k("Z", { ctrl: true, shift: true }), { type: "redo" }],
		["Ctrl+A", k("a", { ctrl: true }), { type: "selectAll" }],
		["Escape cancels", k("Escape"), { type: "cancel" }],
		["R rotates", k("r"), { type: "rotate" }],
		["fit", k("0"), { type: "fit" }],
		["zoom in", k("+"), { type: "zoom", factor: 1.25 }],
		["zoom out", k("-"), { type: "zoom", factor: 0.8 }],
		["tool: rectangle", k("b"), { type: "tool", tool: "rect" }],
		["tool: polygon", k("p"), { type: "tool", tool: "polygon" }],
		["tool: select", k("v"), { type: "tool", tool: "select" }],
	])("%s", (_n, input, cmd) => {
		expect(commandFor(input, idle)).toEqual(cmd);
	});

	it("while a polygon is being drawn: Enter finishes, Backspace removes a point, arrows and Delete are left alone, Esc cancels", () => {
		expect(commandFor(k("Enter"), drawing)).toEqual({ type: "finish" });
		expect(commandFor(k("Backspace"), drawing)).toEqual({ type: "backPoint" });
		expect(commandFor(k("ArrowLeft"), drawing)).toBeUndefined();
		expect(commandFor(k("Delete"), drawing)).toBeUndefined();
		expect(commandFor(k("Escape"), drawing)).toEqual({ type: "cancel" });
	});

	it("Enter does nothing when nothing is being drawn", () => {
		expect(commandFor(k("Enter"), idle)).toBeUndefined();
	});

	it("takes no key while the person is typing", () => {
		for (const key of ["ArrowLeft", "Delete", "r", "Escape", "Backspace"]) {
			expect(commandFor(k(key), { typing: true, drawing: false })).toBeUndefined();
		}
		expect(commandFor(k("z", { ctrl: true }), { typing: true, drawing: false })).toBeUndefined();
	});

	it("leaves unknown keys and browser shortcuts to the page", () => {
		expect(commandFor(k("q"), idle)).toBeUndefined();
		expect(commandFor(k("c", { ctrl: true }), idle)).toBeUndefined();
		expect(commandFor(k("r", { ctrl: true }), idle)).toBeUndefined();
		expect(commandFor(k("p", { alt: true }), idle)).toBeUndefined();
	});
});
