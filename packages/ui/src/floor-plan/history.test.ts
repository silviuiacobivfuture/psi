import { describe, expect, it } from "vitest";
import { canRedo, canUndo, createHistory, HISTORY_LIMIT, push, redo, undo } from "./history";

describe("history", () => {
	it("undoes and redoes in order", () => {
		let h = createHistory(0);
		h = push(push(push(h, 1), 2), 3);
		expect(h.present).toBe(3);
		h = undo(undo(h));
		expect(h.present).toBe(1);
		expect(canRedo(h)).toBe(true);
		expect(redo(h).present).toBe(2);
	});
	it("does nothing at the ends", () => {
		const h = createHistory("a");
		expect(undo(h)).toBe(h);
		expect(redo(h)).toBe(h);
		expect(canUndo(h)).toBe(false);
		expect(canRedo(h)).toBe(false);
	});
	it("a new edit after an undo clears redo", () => {
		let h = push(push(createHistory(0), 1), 2);
		h = push(undo(h), 9);
		expect(canRedo(h)).toBe(false);
		expect(undo(h).present).toBe(1);
	});
	it("the same value records nothing", () => {
		const v = { a: 1 };
		const h = createHistory(v);
		expect(push(h, v)).toBe(h);
	});
	it("coalesces repeated keys into one step, and a new key starts another", () => {
		let h = createHistory(0);
		h = push(h, 1, "nudge");
		h = push(h, 2, "nudge");
		h = push(h, 3, "nudge");
		expect(undo(h).present).toBe(0);
		h = push(h, 4, "rotate");
		expect(undo(h).present).toBe(3);
	});
	it("an undo ends coalescing", () => {
		let h = push(push(createHistory(0), 1, "k"), 2, "k");
		h = undo(h);
		h = push(h, 7, "k");
		expect(undo(h).present).toBe(0);
	});
	it("is bounded", () => {
		let h = createHistory(0);
		for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = push(h, i);
		expect(h.past).toHaveLength(HISTORY_LIMIT);
		for (let i = 0; i < HISTORY_LIMIT + 20; i++) h = undo(h);
		expect(h.present).toBe(20);
	});
});
