export interface KeyInput {
	key: string;
	ctrl: boolean;
	meta: boolean;
	shift: boolean;
	alt: boolean;
}

export interface KeyContext {
	/** Focus is in a text field, select or the like: the plan never takes the key. */
	typing: boolean;
	/** A polygon is being drawn (its points are not in the document yet). */
	drawing: boolean;
}

export type Command =
	| { type: "nudge"; dx: number; dy: number }
	| { type: "resize"; dx: number; dy: number }
	| { type: "delete" }
	| { type: "undo" }
	| { type: "redo" }
	| { type: "cancel" }
	| { type: "finish" }
	| { type: "backPoint" }
	| { type: "rotate" }
	| { type: "selectAll" }
	| { type: "fit" }
	| { type: "zoom"; factor: number }
	| { type: "tool"; tool: "select" | "rect" | "polygon" | "door" | "window" | "device" };

/** A plain arrow moves one unit (10 cm); with Shift ten units (1 m). Alt+arrows resize the same steps. */
export const NUDGE_UNITS = 1;
export const NUDGE_BIG_UNITS = 10;

const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
	ArrowLeft: [-1, 0],
	ArrowRight: [1, 0],
	ArrowUp: [0, -1],
	ArrowDown: [0, 1],
};

const TOOLS: Readonly<Record<string, Extract<Command, { type: "tool" }>["tool"]>> = {
	v: "select",
	b: "rect",
	p: "polygon",
	d: "door",
	w: "window",
	e: "device",
};

/** The one place a key becomes a command; undefined means the page keeps the key. */
export function commandFor(k: KeyInput, ctx: KeyContext): Command | undefined {
	if (ctx.typing) return undefined;
	const mod = k.ctrl || k.meta;
	const key = k.key.length === 1 ? k.key.toLowerCase() : k.key;
	if (mod) {
		if (key === "z") return k.shift ? { type: "redo" } : { type: "undo" };
		if (key === "y") return { type: "redo" };
		if (key === "a") return { type: "selectAll" };
		return undefined;
	}
	const arrow = ARROWS[k.key];
	if (arrow !== undefined) {
		if (ctx.drawing) return undefined;
		const step = k.shift ? NUDGE_BIG_UNITS : NUDGE_UNITS;
		const dx = arrow[0] * step;
		const dy = arrow[1] * step;
		return k.alt ? { type: "resize", dx, dy } : { type: "nudge", dx, dy };
	}
	switch (k.key) {
		case "Delete":
			return ctx.drawing ? undefined : { type: "delete" };
		case "Backspace":
			return ctx.drawing ? { type: "backPoint" } : { type: "delete" };
		case "Escape":
			return { type: "cancel" };
		case "Enter":
			return ctx.drawing ? { type: "finish" } : undefined;
		case "+":
		case "=":
			return { type: "zoom", factor: 1.25 };
		case "-":
			return { type: "zoom", factor: 0.8 };
		case "0":
			return { type: "fit" };
		default:
	}
	if (k.alt) return undefined;
	if (key === "r") return { type: "rotate" };
	const tool = TOOLS[key];
	return tool === undefined ? undefined : { type: "tool", tool };
}
