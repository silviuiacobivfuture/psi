/**
 * The compass's invitation, page side (inlined with `compass-chat.ts`, see `build.ts`). The server
 * renders every word (the label, the placeholders, the one nudge for this page); this only decides
 * WHEN to show what it rendered:
 *
 * - the nudge: a small speech bubble above the capsule, once per session and site, after about ten
 *   seconds on the page (or a scroll to 40 %), never while the visitor types, the sheet is open,
 *   the capsule has stepped aside for the page's own ask box, or a conversation exists;
 * - the placeholder, cycling through a few example questions with a soft fade (not under
 *   reduced motion);
 * - the first time the sheet opens on a device it shows the guide, so the welcome and the quick
 *   replies are there at once;
 * - three cookieless counters (`open`, `nudge`, `nudge_click`) posted to the site, never a text.
 */

type Signal = "open" | "nudge" | "nudge_click";

const NUDGE_AFTER_MS = 10_000;
const NUDGE_SCROLL = 0.4;
const NUDGE_STAYS_MS = 30_000;
const TICK_MS = 1_000;
const CYCLE_MS = 6_000;
const FADE_MS = 240;
const MAX_EXAMPLES = 6;

const prefersReduced = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function area(kind: "session" | "local"): Storage | null {
	try {
		return kind === "session" ? window.sessionStorage : window.localStorage;
	} catch {
		return null;
	}
}

/** Reads a flag, or null when the storage is unavailable (then nothing is remembered or shown). */
function flag(kind: "session" | "local", key: string): boolean | null {
	try {
		const store = area(kind);
		return store === null ? null : store.getItem(key) !== null;
	} catch {
		return null;
	}
}

function setFlag(kind: "session" | "local", key: string): void {
	try {
		area(kind)?.setItem(key, "1");
	} catch {
		// Full or blocked: the invitation simply is not remembered.
	}
}

/** One counter step, fired and forgotten: no cookie, no identifier, no text. */
function signal(url: string | undefined, e: Signal): void {
	if (url === undefined || url === "") return;
	try {
		void fetch(url, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ e }),
			keepalive: true,
			credentials: "omit",
		}).catch(() => undefined);
	} catch {
		// Counting never gets in the visitor's way.
	}
}

function typingElsewhere(): boolean {
	const el = document.activeElement;
	if (!(el instanceof HTMLElement)) return false;
	return ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable;
}

function scrolledPast(): boolean {
	const room = document.documentElement.scrollHeight - window.innerHeight;
	if (room < window.innerHeight * 0.5) return false;
	return window.scrollY / room >= NUDGE_SCROLL;
}

/** The speech bubble: due after a while on the page, shown at most once per session and site. */
function nudge(
	nav: HTMLElement,
	form: HTMLFormElement,
	key: string,
	url: string | undefined,
): void {
	const bubble = nav.querySelector<HTMLElement>(".pz-compass__nudge");
	const ask = nav.querySelector<HTMLElement>(".pz-compass__nudge-ask");
	const close = nav.querySelector<HTMLElement>(".pz-compass__nudge-close");
	const field = form.querySelector<HTMLTextAreaElement>("textarea");
	const answer = nav.querySelector<HTMLElement>(".pz-compass__answer");
	if (bubble === null || ask === null || close === null) return;
	const mark = `psi.nudge.${key}`;
	// Without a session store there is no way to promise "once": no nudge at all.
	if (flag("session", mark) !== false) return;
	let dwell = 0;
	let shownAt = 0;
	let timer = 0;
	const busy = (): boolean =>
		nav.classList.contains("is-open") ||
		nav.classList.contains("is-yielding") ||
		form.contains(document.activeElement) ||
		typingElsewhere() ||
		(field?.value ?? "") !== "" ||
		(answer?.childElementCount ?? 0) > 0;
	const hide = (): void => {
		bubble.hidden = true;
		nav.classList.remove("is-nudging");
		window.clearInterval(timer);
	};
	const show = (): void => {
		setFlag("session", mark);
		shownAt = Date.now();
		bubble.hidden = false;
		nav.classList.add("is-nudging");
		signal(url, "nudge");
	};
	ask.addEventListener("click", () => {
		signal(url, "nudge_click");
		hide();
	});
	close.addEventListener("click", hide);
	timer = window.setInterval(() => {
		if (!bubble.hidden) {
			if (busy() || Date.now() - shownAt > NUDGE_STAYS_MS) hide();
			return;
		}
		if (document.visibilityState === "visible") dwell += TICK_MS;
		if ((dwell >= NUDGE_AFTER_MS || scrolledPast()) && !busy()) show();
	}, TICK_MS);
}

/** Example questions in the field, one after another, fading; still while it is in use. */
function cycle(nav: HTMLElement, input: HTMLTextAreaElement): void {
	let list: string[] = [];
	try {
		const raw: unknown = JSON.parse(input.dataset.cycle ?? "[]");
		if (Array.isArray(raw)) {
			list = raw
				.filter((x): x is string => typeof x === "string" && x !== "")
				.slice(0, MAX_EXAMPLES);
		}
	} catch {
		return;
	}
	if (list.length < 2) return;
	let at = 0;
	window.setInterval(() => {
		const resting =
			document.visibilityState === "visible" &&
			!prefersReduced() &&
			!nav.classList.contains("is-open") &&
			!nav.classList.contains("is-chat") &&
			document.activeElement !== input &&
			input.value === "";
		if (!resting) return;
		at = (at + 1) % list.length;
		input.classList.add("is-swapping");
		window.setTimeout(() => {
			input.placeholder = list[at] ?? input.placeholder;
			input.classList.remove("is-swapping");
		}, FADE_MS);
	}, CYCLE_MS);
}

/**
 * The sheet's first opening: counted once per page; and on a device that has never had the guide
 * open, with nothing kept, it opens on the guide (greeting and quick replies) instead of the
 * pages.
 */
function opening(nav: HTMLElement, key: string, url: string | undefined): void {
	const welcomed = `psi.welcomed.${key}`;
	let counted = false;
	let was = nav.classList.contains("is-open");
	new MutationObserver(() => {
		const now = nav.classList.contains("is-open");
		const arrived = now && !was;
		was = now;
		if (!arrived) return;
		if (!counted) {
			counted = true;
			signal(url, "open");
		}
		if (flag("local", welcomed) !== false) return;
		setFlag("local", welcomed);
		const empty = (nav.querySelector(".pz-compass__answer")?.childElementCount ?? 0) === 0;
		if (empty && !nav.classList.contains("is-chat")) {
			nav.querySelector<HTMLElement>(".pz-compass__view")?.click();
		}
	}).observe(nav, { attributes: true, attributeFilter: ["class"] });
}

const nav = document.currentScript?.closest<HTMLElement>(".pz-compass") ?? null;
const form = nav?.querySelector<HTMLFormElement>(".pz-compass__bar") ?? null;
const input = nav?.querySelector<HTMLTextAreaElement>("textarea.pz-compass__input") ?? null;
const inviteKey = nav?.dataset.inviteKey;
if (nav !== null && form !== null && inviteKey !== undefined) {
	const url = nav.dataset.signalUrl;
	opening(nav, inviteKey, url);
	nudge(nav, form, inviteKey, url);
	if (input !== null) cycle(nav, input);
}

export {};
