/** @jsxRuntime automatic @jsxImportSource hono/jsx */
// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import {
	engage,
	focusIn,
	focusOut,
	installBrowser,
	key,
	type M,
	mount,
	setVisibility,
	tick,
} from "./fullscreen-harness";

installBrowser();

describe("the automatic entry after a minute of engagement", () => {
	it("59 s is not full screen, 60 s is, and says so politely", async () => {
		const m = mount();
		await engage(m);
		await tick(59_000);
		expect(m.full()).toBe(false);
		expect(m.live.textContent).toBe("");
		await tick(1_000);
		expect(m.full()).toBe(true);
		expect(m.fs.getAttribute("aria-pressed")).toBe("true");
		expect(m.fs.getAttribute("aria-label")).toBe("Ieși din ecran complet");
		expect(m.live.textContent).toBe("Ecran complet activat");
		expect(m.live.getAttribute("aria-live")).toBe("polite");
		expect(document.documentElement.classList.contains("pz-compass-lock")).toBe(true);
	});

	it("restarts from zero when focus leaves for the page and comes back", async () => {
		const m = mount();
		await engage(m);
		await tick(30_000);
		const outside = document.body.appendChild(document.createElement("a"));
		focusOut(m.input, outside);
		focusIn(outside);
		await tick(30_000);
		focusIn(m.input);
		await tick(59_000);
		expect(m.full()).toBe(false);
		await tick(1_000);
		expect(m.full()).toBe(true);
	});

	it("keeps counting while focus moves between the widget's own controls", async () => {
		const m = mount();
		await engage(m);
		await tick(30_000);
		focusOut(m.input, m.close);
		focusIn(m.close);
		await tick(30_000);
		expect(m.full()).toBe(true);
	});

	it("restarts after a click outside", async () => {
		const m = mount();
		await engage(m);
		await tick(30_000);
		document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
		await tick(30_000);
		focusIn(m.input);
		await tick(59_000);
		expect(m.full()).toBe(false);
		await tick(1_000);
		expect(m.full()).toBe(true);
	});

	it("restarts when the window blurs", async () => {
		const m = mount();
		await engage(m);
		await tick(30_000);
		window.dispatchEvent(new Event("blur"));
		await tick(40_000);
		expect(m.full()).toBe(false);
		m.input.focus();
		window.dispatchEvent(new Event("focus"));
		await tick(59_000);
		expect(m.full()).toBe(false);
		await tick(1_000);
		expect(m.full()).toBe(true);
	});

	it("restarts when the tab is hidden", async () => {
		const m = mount();
		await engage(m);
		await tick(30_000);
		setVisibility("hidden");
		document.dispatchEvent(new Event("visibilitychange"));
		await tick(40_000);
		expect(m.full()).toBe(false);
		setVisibility("visible");
		document.dispatchEvent(new Event("visibilitychange"));
		await tick(59_000);
		expect(m.full()).toBe(false);
		await tick(1_000);
		expect(m.full()).toBe(true);
	});

	it("restarts when the panel closes", async () => {
		const m = mount();
		await engage(m);
		await tick(30_000);
		m.nav.classList.remove("is-open");
		await tick(0);
		await tick(40_000);
		m.nav.classList.add("is-open");
		await tick(0);
		await tick(59_000);
		expect(m.full()).toBe(false);
		await tick(1_000);
		expect(m.full()).toBe(true);
	});

	it("counts the pointer alone, and a pointer that leaves without focus resets", async () => {
		const m = mount();
		m.open();
		await tick(0);
		m.sheet.dispatchEvent(new Event("pointerover", { bubbles: true }));
		await tick(30_000);
		document.body.dispatchEvent(new Event("pointerover", { bubbles: true }));
		await tick(40_000);
		expect(m.full()).toBe(false);
		m.sheet.dispatchEvent(new Event("pointerover", { bubbles: true }));
		await tick(60_000);
		expect(m.full()).toBe(true);
	});

	it("does not count the scrim as the widget", async () => {
		const m = mount();
		m.open();
		await tick(0);
		m.nav
			.querySelector(".pz-compass__scrim")
			?.dispatchEvent(new Event("pointerover", { bubbles: true }));
		await tick(120_000);
		expect(m.full()).toBe(false);
	});

	it("does not count the destinations view, only the chat", async () => {
		const m = mount();
		m.nav.classList.add("is-open");
		await tick(0);
		focusIn(m.input);
		await tick(120_000);
		expect(m.full()).toBe(false);
	});

	it("keeps its state and its count when the transcript or the toggle is patched", async () => {
		const m = mount();
		await engage(m);
		await tick(30_000);
		m.answer.insertAdjacentHTML("beforeend", '<div id="e1" class="pz-exchange">one</div>');
		await tick(30_000);
		expect(m.full()).toBe(true);
		// A patch replaces the transcript and even the toggle with the server's fresh markup.
		m.answer.replaceChildren();
		const fresh = m.fs.cloneNode(true);
		m.fs.replaceWith(fresh);
		await tick(0);
		expect(m.full()).toBe(true);
		expect(m.nav.querySelector(".pz-compass__fs")?.getAttribute("aria-pressed")).toBe("true");
		expect(m.nav.querySelector(".pz-compass__fs")?.getAttribute("aria-label")).toBe(
			"Ieși din ecran complet",
		);
	});
});

describe("leaving full screen", () => {
	async function full(m: M) {
		await engage(m);
		await tick(60_000);
		expect(m.full()).toBe(true);
	}

	it("blocks the automatic re-entry after the button, until a new conversation", async () => {
		const m = mount();
		await full(m);
		m.fs.click();
		expect(m.full()).toBe(false);
		expect(m.fs.getAttribute("aria-pressed")).toBe("false");
		expect(document.documentElement.classList.contains("pz-compass-lock")).toBe(false);
		await tick(180_000);
		expect(m.full()).toBe(false);
		m.newChat.click();
		await tick(59_000);
		expect(m.full()).toBe(false);
		await tick(1_000);
		expect(m.full()).toBe(true);
	});

	it("blocks it after Escape too, and the block outlives the page in the session", async () => {
		const m = mount();
		await full(m);
		key(m.input, "Escape");
		await tick(180_000);
		expect(m.full()).toBe(false);
		const again = mount();
		await engage(again);
		await tick(180_000);
		expect(again.full()).toBe(false);
	});

	it("is not a manual exit when the panel closes: the next minute enters again", async () => {
		const m = mount();
		await full(m);
		m.nav.classList.remove("is-open");
		await tick(0);
		expect(m.full()).toBe(false);
		expect(document.documentElement.classList.contains("pz-compass-lock")).toBe(false);
		m.nav.classList.add("is-open");
		await tick(0);
		focusIn(m.input);
		await tick(60_000);
		expect(m.full()).toBe(true);
	});

	it("puts the page back where it was", async () => {
		const m = mount();
		vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
		Object.defineProperty(window, "scrollY", { configurable: true, value: 420 });
		await engage(m);
		await tick(60_000);
		Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
		m.fs.click();
		expect(window.scrollTo).toHaveBeenCalledTimes(1);
		expect(window.scrollTo).toHaveBeenCalledWith({ top: 420, behavior: "instant" });
	});
});

describe("Escape", () => {
	async function fullWith(m: M) {
		await engage(m);
		await tick(60_000);
	}
	const slot = (m: M) => {
		const b = document.createElement("button");
		b.textContent = "10:00";
		m.answer.append(b);
		return b;
	};

	for (const from of ["the field", "a slot button", "the panel", "the page body"] as const) {
		it(`from ${from} leaves full screen, keeps the chat open and goes no further`, async () => {
			const m = mount();
			await fullWith(m);
			const el = {
				"the field": m.input,
				"a slot button": slot(m),
				"the panel": m.sheet,
				"the page body": document.body,
			}[from];
			const e = key(el, "Escape");
			expect(m.full()).toBe(false);
			expect(e.defaultPrevented).toBe(true);
			expect(m.win.datastar).not.toHaveBeenCalled();
			expect(m.nav.classList.contains("is-open")).toBe(true);
			expect(document.activeElement).toBe(m.input);
		});
	}

	it("when not full screen keeps its old behaviour: it reaches the page and closes the sheet", async () => {
		const m = mount();
		await engage(m);
		const e = key(m.input, "Escape");
		expect(e.defaultPrevented).toBe(false);
		expect(m.win.datastar).toHaveBeenCalledTimes(1);
		expect(m.nav.classList.contains("is-open")).toBe(false);
	});

	it("leaves other keys alone in full screen", async () => {
		const m = mount();
		await fullWith(m);
		const e = key(m.input, "a");
		expect(e.defaultPrevented).toBe(false);
		expect(m.full()).toBe(true);
	});

	it("keeps Tab inside the widget", async () => {
		const m = mount();
		await fullWith(m);
		const go = m.nav.querySelector<HTMLElement>(".pz-compass__action a");
		const first = m.nav.querySelector<HTMLElement>(".pz-compass__view");
		if (!go || !first) throw new Error("controls");
		go.focus();
		expect(key(go, "Tab").defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(first);
		expect(key(first, "Tab", { shiftKey: true }).defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(go);
		const outside = document.body.appendChild(document.createElement("button"));
		outside.focus();
		key(outside, "Tab");
		expect(document.activeElement).toBe(first);
	});
});

describe("the toggle button", () => {
	it("is a named, keyboard-reachable button that starts unpressed", async () => {
		const m = mount();
		expect(m.fs.tagName).toBe("BUTTON");
		expect(m.fs.type).toBe("button");
		expect(m.fs.hasAttribute("tabindex")).toBe(false);
		expect(m.fs.disabled).toBe(false);
		expect(m.fs.getAttribute("aria-pressed")).toBe("false");
		expect(m.fs.getAttribute("aria-label")).toBe("Ecran complet");
	});

	it("toggles once per click, and aria-pressed and the name follow", async () => {
		const m = mount();
		m.open();
		await tick(0);
		m.fs.click();
		expect(m.full()).toBe(true);
		expect(m.fs.getAttribute("aria-pressed")).toBe("true");
		expect(m.live.textContent).toBe("");
		m.fs.click();
		expect(m.full()).toBe(false);
		expect(m.fs.getAttribute("aria-pressed")).toBe("false");
		expect(m.fs.getAttribute("aria-label")).toBe("Ecran complet");
	});
});
