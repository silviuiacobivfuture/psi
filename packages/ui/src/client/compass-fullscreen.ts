/**
 * The compass chat's full screen, page side (inlined with `compass-chat.ts`, see `build.ts`).
 * The server renders the toggle button and the live region with every word; this decides WHEN:
 *
 * - the toggle button (`.pz-compass__fs`, `aria-pressed`) enters and leaves full screen;
 * - after 60 s of continuous engagement with the widget (the sheet and the capsule, not the scrim
 *   or the page) the chat goes full screen by itself and says so through a polite live region.
 *   Engaged = the sheet is open on the chat, the window is focused and visible, and focus or the
 *   pointer is inside the widget. Anything else (focus moving out, a click outside, the window
 *   blurring, the tab hiding, the sheet closing) starts the count again from zero;
 * - booking goes full screen at once: a click on the capsule's action, on any "Programează…"
 *   button or link in the conversation, or the guide's answer rendering the slot picker or the
 *   booking form (that last one is announced, being no gesture of the visitor's);
 * - leaving full screen by hand (button or Escape) blocks the automatic entry until a new
 *   conversation starts (kept for the browser session, so another page of the site honours it);
 * - Escape, in the capture phase at the document, leaves full screen first no matter where the
 *   focus is, and stops there: the chat stays open;
 * - while full, the page behind is locked (its scroll position comes back on leaving) and Tab
 *   stays inside the widget.
 *
 * The state lives in this closure and in a class on the compass, never in a Datastar signal: the
 * server patches only the transcript, so a patch cannot lose it, and the toggle is repainted if
 * anything ever replaces it.
 */

const ENGAGE_MS = 60_000;
const BLOCKED_KEY = "psi.chatfs.exited";
/** A booking button's words ("Programează evaluarea", "Book an evaluation"). */
const BOOKING_WORDS = /^\s*(programeaz|book\b|schedule\b|make an appointment)/i;
const LOCK_CLASS = "pz-compass-lock";
const FOCUSABLE =
	'a[href], button, textarea, input, select, summary, [tabindex]:not([tabindex="-1"])';

function sessionFlag(): Storage | null {
	try {
		return window.sessionStorage;
	} catch {
		return null;
	}
}

function readBlocked(): boolean {
	try {
		const store = sessionFlag();
		return store !== null && store.getItem(BLOCKED_KEY) !== null;
	} catch {
		return false;
	}
}

function writeBlocked(blocked: boolean): void {
	try {
		if (blocked) sessionFlag()?.setItem(BLOCKED_KEY, "1");
		else sessionFlag()?.removeItem(BLOCKED_KEY);
	} catch {
		// Blocked storage: the choice lasts as long as this page.
	}
}

/** Not hidden by the attribute, a Datastar `data-show`, or the `disabled` state. */
function usable(el: HTMLElement, root: HTMLElement): boolean {
	if (el.hasAttribute("disabled") || el.getAttribute("aria-hidden") === "true") return false;
	for (let n: HTMLElement | null = el; n !== null && n !== root; n = n.parentElement) {
		if (n.hidden || n.style.display === "none") return false;
	}
	return true;
}

function fullscreen(nav: HTMLElement, sheet: HTMLElement, form: HTMLElement): void {
	const input = nav.querySelector<HTMLTextAreaElement>("textarea.pz-compass__input");
	const live = nav.querySelector<HTMLElement>(".pz-compass__fs-live");
	const inWidget = (t: EventTarget | null): boolean =>
		t instanceof Node && (sheet.contains(t) || form.contains(t));
	const open = (): boolean => nav.classList.contains("is-open");
	const chat = (): boolean => nav.classList.contains("is-chat");

	let full = false;
	let blocked = readBlocked();
	let focusIn = inWidget(document.activeElement);
	let pointerIn = false;
	let windowFocused = document.hasFocus();
	let visible = document.visibilityState !== "hidden";
	let timer: number | null = null;
	let scrollY = 0;
	/** The capsule's action was used before the sheet showed the chat: full screen when it does. */
	let wanted = false;

	const engaged = (): boolean =>
		open() && chat() && !full && !blocked && windowFocused && visible && (focusIn || pointerIn);

	const stop = (): void => {
		if (timer === null) return;
		window.clearTimeout(timer);
		timer = null;
	};
	/** Starts the count when engaged, drops it when not: there is no pause, only zero. */
	const sync = (): void => {
		if (!engaged()) stop();
		else if (timer === null) {
			timer = window.setTimeout(() => {
				timer = null;
				if (engaged()) enter(true);
			}, ENGAGE_MS);
		}
	};
	/** Back to zero, and counting again at once if still engaged. */
	const reset = (): void => {
		stop();
		sync();
	};

	const paint = (): void => {
		const button = nav.querySelector<HTMLElement>(".pz-compass__fs");
		const pressed = full ? "true" : "false";
		if (button !== null) {
			if (button.getAttribute("aria-pressed") !== pressed)
				button.setAttribute("aria-pressed", pressed);
			const label = (full ? button.dataset.exit : button.dataset.enter) ?? "";
			if (label !== "" && button.getAttribute("aria-label") !== label) {
				button.setAttribute("aria-label", label);
			}
		}
		nav.classList.toggle("is-fullscreen", full);
		document.documentElement.classList.toggle(LOCK_CLASS, full);
	};

	function enter(auto: boolean): void {
		if (full) return;
		scrollY = window.scrollY;
		full = true;
		stop();
		paint();
		if (!inWidget(document.activeElement)) input?.focus({ preventScroll: true });
		if (auto && live !== null) live.textContent = live.dataset.on ?? "";
	}

	/** `by`: the visitor chose it (button, Escape) or the sheet closed under it. */
	function exit(by: "button" | "escape" | "closed"): void {
		if (!full) return;
		full = false;
		if (live !== null) live.textContent = "";
		paint();
		if (window.scrollY !== scrollY) window.scrollTo({ top: scrollY, behavior: "instant" });
		if (by !== "closed") {
			blocked = true;
			writeBlocked(true);
		}
		if (by === "escape") input?.focus({ preventScroll: true });
		reset();
	}

	/** Booking starts: full screen, unless the visitor left it by hand in this conversation. */
	const booking = (auto: boolean): void => {
		if (!blocked && open() && chat()) enter(auto);
	};

	nav.addEventListener("click", (e) => {
		const target = e.target instanceof Element ? e.target : null;
		const control = target?.closest("a, button") ?? null;
		if (target?.closest(".pz-compass__fs")) {
			if (full) exit("button");
			else enter(false);
		} else if (control !== null && control.closest(".pz-compass__action") !== null) {
			if (blocked) return;
			if (open() && chat()) enter(false);
			else {
				// The sheet is not on the chat yet: bring it up, and go full screen as it arrives.
				wanted = true;
				if (!chat()) nav.querySelector<HTMLElement>(".pz-compass__view")?.click();
				if (!open()) nav.querySelector<HTMLElement>(".pz-compass__orb")?.click();
			}
		} else if (
			control !== null &&
			control.closest(".pz-compass__chat") !== null &&
			BOOKING_WORDS.test(control.textContent ?? "")
		) {
			booking(false);
		} else if (target?.closest(".pz-compass__new")) {
			// A new conversation: the automatic entry is allowed again, counted from zero.
			blocked = false;
			writeBlocked(false);
			reset();
		}
	});

	// Escape first, whatever has the focus: it ends full screen and goes no further.
	document.addEventListener(
		"keydown",
		(e) => {
			if (!full) return;
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
				exit("escape");
				return;
			}
			if (e.key !== "Tab") return;
			const items = [...nav.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
				(el) => inWidget(el) && usable(el, nav),
			);
			const first = items[0];
			const last = items[items.length - 1];
			if (first === undefined || last === undefined) return;
			const active = document.activeElement;
			const stray = !inWidget(active);
			if (e.shiftKey ? stray || active === first : stray || active === last) {
				e.preventDefault();
				(e.shiftKey ? last : first).focus();
			}
		},
		{ capture: true },
	);

	document.addEventListener("focusin", (e) => {
		focusIn = inWidget(e.target);
		if (focusIn) sync();
		else reset();
	});
	document.addEventListener("focusout", (e) => {
		// A null destination is a click on something unfocusable or a window blur: those have their own events.
		if (e.relatedTarget === null || inWidget(e.relatedTarget)) return;
		focusIn = false;
		reset();
	});
	document.addEventListener(
		"pointerdown",
		(e) => {
			if (inWidget(e.target)) return;
			focusIn = false;
			pointerIn = false;
			reset();
		},
		{ capture: true },
	);
	document.addEventListener("pointerover", (e) => {
		pointerIn = inWidget(e.target);
		sync();
	});
	document.documentElement.addEventListener("pointerleave", () => {
		pointerIn = false;
		sync();
	});
	window.addEventListener("blur", () => {
		windowFocused = false;
		reset();
	});
	window.addEventListener("focus", () => {
		windowFocused = true;
		focusIn = inWidget(document.activeElement);
		reset();
	});
	document.addEventListener("visibilitychange", () => {
		visible = document.visibilityState !== "hidden";
		reset();
	});

	// The sheet opening, closing, or switching view: closing also ends full screen.
	let was = `${open()}${chat()}`;
	new MutationObserver(() => {
		const now = `${open()}${chat()}`;
		if (now === was) return;
		const wasOpen = was.startsWith("true");
		was = now;
		if (!open()) {
			// Closing a sheet that was up cancels the wish; the view switch before opening does not.
			if (wasOpen) wanted = false;
			exit("closed");
		} else if (wanted && chat()) {
			wanted = false;
			if (!blocked) enter(false);
		}
		reset();
	}).observe(nav, { attributes: true, attributeFilter: ["class"] });

	// The guide's answer brings the slot picker or the booking form (a live patch; a restored
	// transcript only has text, and an older form is already retired).
	const answer = nav.querySelector<HTMLElement>(".pz-compass__answer");
	if (answer !== null) {
		new MutationObserver((records) => {
			const live = records.some((r) =>
				[...r.addedNodes].some(
					(n) =>
						n instanceof Element &&
						(n.matches("[data-booking-summary]") ||
							n.querySelector("[data-booking-summary]:not([data-retired])") !== null) &&
						!n.hasAttribute("data-retired"),
				),
			);
			if (live) booking(true);
		}).observe(answer, { childList: true, subtree: true });
	}

	// Whatever replaces the toggle (a patch) gets the current state again.
	new MutationObserver(paint).observe(nav, { childList: true, subtree: true });

	sync();
}

const nav = document.currentScript?.closest<HTMLElement>(".pz-compass") ?? null;
const sheet = nav?.querySelector<HTMLElement>(".pz-compass__sheet") ?? null;
const form = nav?.querySelector<HTMLFormElement>(".pz-compass__bar") ?? null;
if (nav !== null && sheet !== null && form !== null) fullscreen(nav, sheet, form);

export {};
