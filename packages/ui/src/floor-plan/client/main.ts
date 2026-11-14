/**
 * The floor plan's page script. The server renders every word and every shape; this owns only what
 * must happen under the finger: pan, zoom and pinch, the drawing tools, dragging, the keyboard, and
 * the undo history of the plan being edited. After each edit it writes the plan into the page's
 * Datastar signals and asks the server to patch the layers back; the view (zoom and pan) lives on
 * `[data-fp-view]`, which no patch replaces, so it survives every patch.
 */

import { canRedo, canUndo, createHistory, type History, push, redo, undo } from "../history";
import { commandFor, type KeyInput } from "../keymap";
import { DEVICE_TYPES } from "../limits";
import type { DeviceType, FloorPlanDoc } from "../schema";
import { createDraw, TOOLS } from "./draw";
import { fitBox, type Pt, panBy, pinch, toWorld, transformOf, type View, zoomAt } from "./view";

function isDoc(v: unknown): v is FloorPlanDoc {
	return (
		typeof v === "object" &&
		v !== null &&
		Array.isArray(Reflect.get(v, "floors")) &&
		Reflect.get(v, "version") === 1
	);
}

const q = <T extends Element>(root: ParentNode, sel: string): T | null =>
	root.querySelector<T>(sel);
const reduced = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function typingIn(el: EventTarget | null): boolean {
	return (
		el instanceof HTMLElement &&
		(["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable)
	);
}

function init(root: HTMLElement): void {
	const stage = q<HTMLElement>(root, "[data-fp-stage]");
	const svg = q<SVGSVGElement>(root, "[data-fp-svg]");
	const viewEl = q<SVGGElement>(root, "[data-fp-view]");
	const docScript = q<HTMLScriptElement>(root, "script[data-fp-doc]");
	if (!stage || !svg || !viewEl || !docScript) return;
	const config: unknown = JSON.parse(root.getAttribute("data-fp-config") ?? "{}");
	const draw =
		(typeof config === "object" && config !== null ? Reflect.get(config, "mode") : "") === "draw";
	const parsed: unknown = JSON.parse(docScript.textContent ?? "null");
	if (!isDoc(parsed)) return;

	let hist: History<FloorPlanDoc> = createHistory(parsed);
	let revision = parsed.revision;
	let floor = parsed.floors[0]?.id ?? "";
	const urlFloor = q<HTMLInputElement>(root, "[data-fp-in=floor]");
	if (urlFloor?.value) floor = urlFloor.value;
	let selection: ReadonlySet<string> = new Set();
	let view: View = { k: 1, tx: 0, ty: 0 };
	let needFit = true;
	const canvasLayout = root.classList.contains("pz-fp--canvas");

	const input = (name: string): HTMLInputElement | null =>
		q<HTMLInputElement>(root, `[data-fp-in=${name}]`);
	const writeSignal = (name: string, value: string): void => {
		const el = input(name);
		if (!el || el.value === value) return;
		el.value = value;
		el.dispatchEvent(new Event("input", { bubbles: true }));
	};
	const sync = (): void => {
		if (draw) {
			writeSignal("doc", JSON.stringify(hist.present));
			writeSignal("sel", [...selection].join(","));
		}
		writeSignal("floor", floor);
		root.dispatchEvent(new CustomEvent("fp-sync"));
		updateButtons();
		// Choosing a shape opens its details when the panel floats over the plan.
		if (draw && selection.size > 0 && root.dataset.panel === "closed") setPanel(true);
	};
	const stamp = (d: FloorPlanDoc): FloorPlanDoc =>
		d.revision === revision ? d : { ...d, revision };
	const hintText = (key: string): string => q(root, `[data-hint=${key}]`)?.textContent ?? "";
	const hintEl = q<HTMLElement>(root, "[data-fp-hint]");

	function updateButtons(): void {
		const set = (cmd: string, off: boolean): void => {
			for (const b of root.querySelectorAll<HTMLButtonElement>(`[data-fp-cmd=${cmd}]`))
				b.disabled = off;
		};
		set("undo", !canUndo(hist));
		set("redo", !canRedo(hist));
		const none = selection.size === 0;
		set("rotate", none);
		set("delete", none);
	}

	function applyView(): void {
		viewEl?.setAttribute("transform", transformOf(view));
		stage?.style.setProperty("--fp-inv", String(1 / view.k));
	}
	function size(): { w: number; h: number } {
		const r = stage?.getBoundingClientRect();
		return { w: r?.width ?? 0, h: r?.height ?? 0 };
	}
	function fitView(): void {
		const layer = q<SVGGElement>(root, "#fp-shapes");
		const { w, h } = size();
		if (!layer || w === 0) return;
		const b = layer.getBBox();
		// On a canvas the toolbars float over the top and the assistant's bar over the foot: the plan fits between them.
		const over = canvasLayout ? q<HTMLElement>(root, ".pz-fp__overlay") : null;
		const top = over
			? Math.min(
					160,
					over.getBoundingClientRect().bottom - (stage?.getBoundingClientRect().top ?? 0) + 8,
				)
			: 0;
		const foot = canvasLayout ? 96 : 0;
		const fitted = fitBox({ x: b.x, y: b.y, w: b.width, h: b.height }, w, h - top - foot, 20);
		view = { ...fitted, ty: fitted.ty + top };
		applyView();
	}
	function fitViewBox(): void {
		const { w, h } = size();
		if (w > 0) svg?.setAttribute("viewBox", `0 0 ${w} ${h}`);
	}
	const world = (e: { clientX: number; clientY: number }): Pt => {
		const r = stage?.getBoundingClientRect();
		return toWorld(view, e.clientX - (r?.left ?? 0), e.clientY - (r?.top ?? 0));
	};
	const local = (e: { clientX: number; clientY: number }): Pt => {
		const r = stage?.getBoundingClientRect();
		return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
	};

	const tools = createDraw({
		doc: () => hist.present,
		floorId: () => floor,
		selection: () => selection,
		step: 5,
		scale: () => view.k,
		deviceType: () =>
			(q<HTMLSelectElement>(root, "[data-fp-device-type]")?.value ?? "nfb-amplifier") as DeviceType,
		commit: (next, key, sel) => {
			hist = push(hist, stamp(next), key);
			if (sel) selection = sel;
			selection = new Set(
				[...selection].filter((id) =>
					hist.present.floors.some((f) => f.shapes.some((s) => s.id === id)),
				),
			);
			sync();
		},
		select: (ids) => {
			selection = ids;
			sync();
		},
		ghost: (markup) => {
			const g = q(root, "#fp-ghost");
			if (g) g.innerHTML = markup;
		},
		hint: (key) => {
			if (hintEl) hintEl.textContent = hintText(key);
			for (const b of root.querySelectorAll<HTMLElement>("[data-fp-tool]")) {
				b.setAttribute(
					"aria-pressed",
					b.getAttribute("data-fp-tool") === tools.tool ? "true" : "false",
				);
			}
		},
		floorWord: (n) => hintText("floorDefault").replace("{n}", String(n)),
		setFloor: (id) => {
			floor = id;
			needFit = true;
			sync();
		},
		viewCentre: () => {
			const { w, h } = size();
			return toWorld(view, w / 2, h / 2);
		},
	});

	// Pointer: one finger draws or pans, two fingers pinch, the wheel zooms about the cursor.
	const pointers = new Map<number, Pt>();
	let gesture: "none" | "pan" | "drag" | "pinch" = "none";
	let down: { local: Pt; target: Element | null; shift: boolean } | undefined;
	let moved = false;
	let spaceHeld = false;

	stage.addEventListener("pointerdown", (e) => {
		if (e.target instanceof Element && e.target.closest(".pz-fp__zoom")) return;
		stage.focus({ preventScroll: true });
		stage.setPointerCapture(e.pointerId);
		pointers.set(e.pointerId, local(e));
		if (pointers.size === 2) {
			gesture = "pinch";
			tools.run({ type: "cancel" });
			return;
		}
		down = {
			local: local(e),
			target: e.target instanceof Element ? e.target : null,
			shift: e.shiftKey,
		};
		moved = false;
		gesture = "pan";
		if (draw && e.button === 0 && !spaceHeld)
			gesture = tools.down(down.target, world(e), e.shiftKey);
		else if (draw && e.button === 1) gesture = "pan";
	});
	stage.addEventListener("pointermove", (e) => {
		const before = pointers.get(e.pointerId);
		const now = local(e);
		if (before) pointers.set(e.pointerId, now);
		if (gesture === "pinch" && before && pointers.size === 2) {
			const [a, b] = [...pointers.values()];
			const prev = [...pointers.entries()].map(([id, p]) => (id === e.pointerId ? before : p));
			if (a && b && prev[0] && prev[1]) view = pinch(view, prev[0], prev[1], a, b);
			applyView();
			return;
		}
		if (!before || !down) {
			if (draw) tools.move(world(e));
			return;
		}
		if (Math.hypot(now.x - down.local.x, now.y - down.local.y) > 4) moved = true;
		if (gesture === "pan") {
			view = panBy(view, now.x - before.x, now.y - before.y);
			applyView();
		} else if (gesture === "drag") tools.move(world(e));
	});
	const end = (e: PointerEvent): void => {
		pointers.delete(e.pointerId);
		if (gesture === "pinch") {
			if (pointers.size === 0) gesture = "none";
			return;
		}
		const d = down;
		down = undefined;
		if (gesture === "drag") tools.up(world(e), moved);
		else if (gesture === "pan" && d && !moved && e.type === "pointerup") {
			const room = d.target?.closest("[data-room-id]");
			if (!draw && room) pick(room.getAttribute("data-room-id") ?? "");
			else if (draw) tools.click(d.target, world(e));
		}
		gesture = "none";
	};
	stage.addEventListener("pointerup", end);
	stage.addEventListener("pointercancel", end);
	stage.addEventListener(
		"wheel",
		(e) => {
			e.preventDefault();
			const p = local(e);
			view = zoomAt(view, Math.exp(-e.deltaY * 0.0015), p.x, p.y);
			applyView();
		},
		{ passive: false },
	);
	stage.addEventListener("dblclick", (e) => {
		if (!draw) {
			const p = local(e);
			view = zoomAt(view, 1.6, p.x, p.y);
			applyView();
		}
	});

	// The canvas layout: a side panel that floats over the plan, and "full screen" that also hides the console's chrome.

	const host = root.closest<HTMLElement>(".adm") ?? root;
	let fallbackFull = false;
	function setPanel(open: boolean): void {
		root.dataset.panel = open ? "open" : "closed";
		for (const b of root.querySelectorAll<HTMLElement>(".pz-fp__btn--panel"))
			b.setAttribute("aria-pressed", String(open));
	}
	function showFull(on: boolean): void {
		host.classList.toggle("is-fp-full", on);
		for (const b of root.querySelectorAll<HTMLElement>(".pz-fp__btn--full")) {
			const label = hintText(on ? "exitFullscreen" : "fullscreen");
			b.setAttribute("aria-pressed", String(on));
			b.setAttribute("aria-label", label);
			b.title = label;
		}
	}
	async function toggleFull(): Promise<void> {
		if (document.fullscreenElement === host || fallbackFull) {
			fallbackFull = false;
			if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
			showFull(false);
			return;
		}
		// Where the browser has no element fullscreen (a phone's Safari), the plan fills the page and the chrome hides instead.
		const entered =
			document.fullscreenEnabled === true
				? await host.requestFullscreen().then(
						() => true,
						() => false,
					)
				: false;
		fallbackFull = !entered;
		showFull(true);
	}
	if (canvasLayout) {
		if (window.matchMedia("(min-width: 1500px)").matches) setPanel(true);
		document.addEventListener("fullscreenchange", () => {
			if (document.fullscreenElement !== host && !fallbackFull) showFull(false);
		});
		document.addEventListener("keydown", (e) => {
			if (e.key !== "Escape" || !fallbackFull) return;
			fallbackFull = false;
			showFull(false);
			e.preventDefault();
		});
	}

	function pick(id: string): void {
		if (id !== "") root.dispatchEvent(new CustomEvent("fp-pick", { detail: { id } }));
	}

	function setSelectionFromList(id: string): void {
		selection = new Set([id]);
		sync();
	}

	function command(c: ReturnType<typeof commandFor>): boolean {
		if (!c) return false;
		const centre = size();
		switch (c.type) {
			case "zoom":
				view = zoomAt(view, c.factor, centre.w / 2, centre.h / 2);
				applyView();
				return true;
			case "fit":
				fitView();
				return true;
			case "undo":
			case "redo": {
				if (!draw) return false;
				hist = c.type === "undo" ? undo(hist) : redo(hist);
				hist = { ...hist, present: stamp(hist.present) };
				selection = new Set(
					[...selection].filter((id) =>
						hist.present.floors.some((f) => f.shapes.some((s) => s.id === id)),
					),
				);
				if (!hist.present.floors.some((f) => f.id === floor))
					floor = hist.present.floors[0]?.id ?? floor;
				sync();
				return true;
			}
			case "cancel":
				if (draw && tools.run(c)) return true;
				if (!draw) {
					root.dispatchEvent(new CustomEvent("fp-close"));
					return true;
				}
				return false;
			default:
				return draw ? tools.run(c) : false;
		}
	}

	root.addEventListener("keydown", (e) => {
		if (e.code === "Space" && !typingIn(e.target) && e.target === stage) {
			spaceHeld = true;
			return;
		}
		const t = e.target;
		if (!draw && t instanceof Element && (e.key === "Enter" || e.key === " ")) {
			const room = t.closest("[data-room-id]");
			if (room && t === room) {
				e.preventDefault();
				pick(room.getAttribute("data-room-id") ?? "");
				return;
			}
		}
		const key: KeyInput = {
			key: e.key,
			ctrl: e.ctrlKey,
			meta: e.metaKey,
			shift: e.shiftKey,
			alt: e.altKey,
		};
		const c = commandFor(key, { typing: typingIn(t), drawing: draw && tools.drawing });
		if (c && command(c)) e.preventDefault();
	});
	root.addEventListener("keyup", (e) => {
		if (e.code === "Space") spaceHeld = false;
	});

	root.addEventListener("click", (e) => {
		const t = e.target instanceof Element ? e.target : null;
		if (!t) return;
		const tool = t.closest<HTMLElement>("[data-fp-tool]");
		const toolName = TOOLS.find((t) => t === tool?.getAttribute("data-fp-tool"));
		if (toolName && draw) return void tools.setTool(toolName);
		const cmd = t.closest<HTMLElement>("[data-fp-cmd]")?.getAttribute("data-fp-cmd");
		if (cmd) {
			const map: Record<string, ReturnType<typeof commandFor>> = {
				zoomIn: { type: "zoom", factor: 1.25 },
				zoomOut: { type: "zoom", factor: 0.8 },
				fit: { type: "fit" },
				rotate: { type: "rotate" },
				delete: { type: "delete" },
				undo: { type: "undo" },
				redo: { type: "redo" },
			};
			if (cmd === "fullscreen") return void toggleFull();
			if (cmd === "panel") return void setPanel(root.dataset.panel !== "open");
			if (cmd === "removeFloor") tools.dropFloor();
			else command(map[cmd]);
			return;
		}
		if (t.closest("[data-fp-add-room]")) return void tools.addRoomHere();
		if (t.closest("[data-fp-add-floor]")) return void tools.addFloor();
		const tab = t.closest<HTMLElement>("[data-fp-floor]");
		if (tab) {
			floor = tab.getAttribute("data-fp-floor") ?? floor;
			selection = new Set();
			needFit = true;
			for (const b of root.querySelectorAll("[data-fp-floor]"))
				b.setAttribute("aria-selected", b === tab ? "true" : "false");
			return void sync();
		}
		const sel = t.closest<HTMLElement>("[data-fp-select]");
		if (sel) return setSelectionFromList(sel.getAttribute("data-fp-select") ?? "");
		const room = t.closest<HTMLElement>("button[data-fp-room]");
		if (room) return pick(room.getAttribute("data-fp-room") ?? "");
		if (t.closest("[data-fp-close]")) root.dispatchEvent(new CustomEvent("fp-close"));
	});
	root.addEventListener("change", (e) => {
		const t = e.target;
		if (!draw || !(t instanceof HTMLInputElement || t instanceof HTMLSelectElement)) return;
		const name = t.getAttribute("data-fp-field");
		if (name) tools.field(name, t.getAttribute("data-fp-id"), t.value);
	});
	root.addEventListener("input", (e) => {
		const t = e.target;
		if (draw && t instanceof HTMLInputElement && t.getAttribute("data-fp-field") === "label")
			tools.field("label", t.getAttribute("data-fp-id"), t.value);
	});

	// A patch carries the saved revision; adopt it so the next save is not "stale", and fit after a floor change.
	new MutationObserver(() => {
		const rev = Number(q(root, "[data-fp-rev]")?.getAttribute("data-fp-rev"));
		if (Number.isFinite(rev) && rev > revision) {
			revision = rev;
			hist = { ...hist, present: stamp(hist.present) };
		}
		if (needFit) {
			needFit = false;
			fitView();
		}
	}).observe(viewEl, { childList: true, subtree: true });
	new ResizeObserver(() => {
		fitViewBox();
		if (gesture === "none") applyView();
	}).observe(stage);

	void reduced;
	fitViewBox();
	fitView();
	updateButtons();
	if (draw) tools.setTool("select");
}

for (const root of document.querySelectorAll<HTMLElement>("[data-fp-root]")) init(root);
