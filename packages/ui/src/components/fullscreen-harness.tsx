/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, vi } from "vitest";
import { compileClients } from "../client/build";
import { Compass, type CompassChat } from "./compass";

const SOURCE = readFileSync(join(process.cwd(), "src/client/compass-fullscreen.ts"), "utf8");
export const CLIENT = compileClients([SOURCE]);

const CHAT: CompassChat = {
	storageKey: "psi.chat.test",
	suggestions: ["Programează o evaluare"],
	labels: {
		greeting: "GREETING",
		disclaimer: "D",
		newChat: "NEW",
		close: "CLOSE",
		guideTab: "GUIDE",
		pagesTab: "PAGES",
		views: "VIEWS",
		newMessage: "M",
		placeholder: "CHAT",
		suggestions: "S",
		dropped: "X",
		retry: "R",
		unanswered: "U",
		fullscreen: "Ecran complet",
		exitFullscreen: "Ieși din ecran complet",
		fullscreenOn: "Ecran complet activat",
	},
};

const HTML = String(
	<Compass
		label="L"
		placeholder="P"
		toggleLabel="T"
		askHint="A"
		groups={[]}
		guideAction="/ghid"
		answerId="compass-answer"
		chat={CHAT}
		action={<a href="/contact">Programează evaluarea</a>}
	/>,
);

const added: Array<[EventTarget, string, EventListenerOrEventListenerObject, unknown]> = [];
/** Hides or shows the tab, for the test to announce with `visibilitychange`. */
export function setVisibility(v: DocumentVisibilityState): void {
	visibility = v;
}
let visibility: DocumentVisibilityState = "visible";

/** Mounts the compass's markup and runs the full-screen script as the browser would. */
export function mount() {
	document.body.innerHTML = HTML;
	const nav = document.querySelector<HTMLElement>(".pz-compass");
	const script = nav?.querySelector("script");
	if (!nav || !script) throw new Error("no compass");
	Object.defineProperty(document, "currentScript", { configurable: true, get: () => script });
	new Function(CLIENT)();
	const q = <T extends HTMLElement>(sel: string): T => {
		const el = nav.querySelector<T>(sel);
		if (!el) throw new Error(sel);
		return el;
	};
	const win = {
		/** Datastar's window-level Escape handler, standing in: it closes the sheet. */
		datastar: vi.fn((e: Event) => {
			if (e instanceof KeyboardEvent && e.key === "Escape") nav.classList.remove("is-open");
		}),
	};
	window.addEventListener("keydown", win.datastar);
	added.push([window, "keydown", win.datastar, undefined]);
	return {
		nav,
		win,
		input: q<HTMLTextAreaElement>("textarea.pz-compass__input"),
		fs: q<HTMLButtonElement>(".pz-compass__fs"),
		live: q(".pz-compass__fs-live"),
		answer: q(".pz-compass__answer"),
		sheet: q(".pz-compass__sheet"),
		close: q(".pz-compass__close"),
		newChat: q(".pz-compass__new"),
		open: () => {
			// What Datastar's data-show does when the sheet is up.
			q(".pz-compass__sheet").style.display = "";
			nav.classList.add("is-open", "is-chat");
		},
		full: () => nav.classList.contains("is-fullscreen"),
	};
}
export type M = ReturnType<typeof mount>;

export const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);
export const focusIn = (el: Element) =>
	el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
export const focusOut = (el: Element, to: Element | null) =>
	el.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: to }));
export const key = (el: Element | Document, k: string, init: KeyboardEventInit = {}) => {
	const e = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init });
	el.dispatchEvent(e);
	return e;
};
/** Opens the chat with focus in the field, as typing does. */
export async function engage(m: M) {
	m.open();
	await tick(0);
	focusIn(m.input);
}

const tracked = new WeakSet<EventTarget>();
/** Remembers every listener added to `t`, so the next test starts without the last one's. */
function track(t: EventTarget): void {
	if (tracked.has(t)) return;
	tracked.add(t);
	const orig = t.addEventListener.bind(t);
	t.addEventListener = (
		type: string,
		fn: EventListenerOrEventListenerObject | null,
		opts?: boolean | AddEventListenerOptions,
	): void => {
		if (fn !== null) added.push([t, type, fn, opts]);
		orig(type, fn, opts);
	};
}

/** Registers the fake browser around every test of the file that calls it. */
export function installBrowser(): void {
	beforeEach(() => {
		vi.useFakeTimers();
		visibility = "visible";
		Object.defineProperty(document, "visibilityState", {
			configurable: true,
			get: () => visibility,
		});
		vi.spyOn(document, "hasFocus").mockReturnValue(true);
		for (const t of [document, window, document.documentElement]) track(t);
		window.sessionStorage.clear();
		document.documentElement.className = "";
	});
	afterEach(() => {
		for (const [t, type, fn, opts] of added) t.removeEventListener(type, fn, opts as boolean);
		added.length = 0;
		vi.restoreAllMocks();
		vi.useRealTimers();
	});
}
