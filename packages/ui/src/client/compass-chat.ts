/**
 * The compass chat's page side, inlined once per page right inside the compass (see
 * `compass-chat.generated.ts`, built by `scripts/build-client.ts`). Datastar owns the signals and
 * every request; this keeps what a chat needs from the browser:
 *
 * - `window.psiChat`: the conversation kept per site in localStorage (turns as text, the question
 *   waiting for its answer, the draft), read once at load and written on every change; it expires
 *   after 24 h without activity, and everything works (unkept) when storage is unavailable;
 * - following the newest message, unless the visitor scrolled up to read (then a "new message"
 *   pill); the unread dot on the orb when an answer lands while the sheet is collapsed;
 * - the auto-growing input (Enter sends, Shift+Enter is a new line), the keyboard inset from
 *   `visualViewport`, the bar's height, the drag handle, and retiring an older in-chat booking form.
 */

interface Turn {
	role: "user" | "guide";
	text: string;
	refused?: string;
}
interface ChatState {
	turns: Turn[];
	pending: string;
	draft: string;
	/** The conversation is kept on the server for this person: the turns are not kept here. */
	remembered: boolean;
}
interface PsiChat {
	load(key: string): ChatState | null;
	save(key: string, state: unknown): void;
	clear(key: string): void;
	/** True the first time only: the transcript is restored once per page. */
	claim(): boolean;
}

declare global {
	interface Window {
		psiChat?: PsiChat;
	}
}

const VERSION = 1;
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_TURNS = 20;
const MAX_TEXT = 4000;
const MAX_PENDING = 500;
const MAX_DRAFT = 2000;
// The refusal reasons of the guide's contract (`RefusalReason`).
const REASONS =
	"crisis out_of_scope injection abuse rate_limited exchange_limit no_content unavailable".split(
		" ",
	);

function field(value: unknown, key: string): unknown {
	return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}

function readTurn(value: unknown): Turn | null {
	const role = field(value, "role");
	const text = field(value, "text");
	// An empty `refused` is no refusal (a key a reactive signal object created on reading).
	const raw = field(value, "refused");
	const refused = raw === "" ? undefined : raw;
	if ((role !== "user" && role !== "guide") || typeof text !== "string") return null;
	if (refused !== undefined && (typeof refused !== "string" || !REASONS.includes(refused))) {
		return null;
	}
	const turn: Turn = { role, text: text.slice(0, MAX_TEXT) };
	if (typeof refused === "string") turn.refused = refused;
	return turn;
}

const readString = (value: unknown, max: number): string =>
	typeof value === "string" ? value.slice(0, max) : "";

/** Reads a kept state, or null when it is missing, malformed or older than a day of silence. */
function readState(value: unknown, now: number): ChatState | null {
	const at = field(value, "at");
	if (field(value, "v") !== VERSION || typeof at !== "number" || now - at > TTL_MS) return null;
	return readBody(value);
}

/** The state's content: bounded turns (all well-formed, or none kept), the pending question, the draft. */
function readBody(value: unknown): ChatState | null {
	const raw = field(value, "turns");
	const turns = Array.isArray(raw) ? raw.map(readTurn) : [];
	if (turns.some((t) => t === null)) return null;
	return {
		turns: turns.filter((t): t is Turn => t !== null).slice(-MAX_TURNS),
		pending: readString(field(value, "pending"), MAX_PENDING),
		draft: readString(field(value, "draft"), MAX_DRAFT),
		remembered: field(value, "remembered") === true,
	};
}

function storage(): Storage | null {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

function chatStore(): PsiChat {
	const loaded = new Set<string>();
	const timers = new Map<string, number>();
	const latest = new Map<string, ChatState>();
	let claimed = false;
	let leaving = false;
	// What this page last read or wrote per key: a page brought back from the back-forward cache
	// holds older signals, and must not save them over a conversation another page continued.
	const seen = new Map<string, string | null>();
	const read = (key: string): string | null => {
		try {
			return storage()?.getItem(key) ?? null;
		} catch {
			return null;
		}
	};
	window.addEventListener("pageshow", (e) => {
		if (!e.persisted) return;
		for (const key of loaded) {
			if (read(key) !== (seen.get(key) ?? null)) {
				window.location.reload();
				return;
			}
		}
	});
	const write = (key: string, state: ChatState): void => {
		try {
			const empty =
				state.turns.length === 0 && state.pending === "" && state.draft === "" && !state.remembered;
			if (empty) {
				storage()?.removeItem(key);
				seen.set(key, null);
				return;
			}
			const text = JSON.stringify({
				v: VERSION,
				at: Date.now(),
				turns: state.remembered ? [] : state.turns,
				pending: state.pending,
				draft: state.draft,
				remembered: state.remembered,
			});
			storage()?.setItem(key, text);
			seen.set(key, text);
		} catch {
			// Full or blocked storage: the conversation lives on in the page.
		}
	};
	return {
		load(key) {
			loaded.add(key);
			try {
				const raw = read(key);
				seen.set(key, raw);
				if (raw === null) return null;
				const state = readState(JSON.parse(raw), Date.now());
				if (state === null) storage()?.removeItem(key);
				return state;
			} catch {
				return null;
			}
		},
		save(key, value) {
			// Never before the kept state was read: the page's empty signals would wipe it.
			if (!loaded.has(key)) return;
			const state = readBody(value);
			if (state === null) return;
			if (!leaving) {
				leaving = true;
				// Leaving the page: whatever is still waiting for its timer is written now.
				window.addEventListener("pagehide", () => {
					for (const [k, s] of latest) write(k, s);
				});
			}
			latest.set(key, state);
			window.clearTimeout(timers.get(key));
			timers.set(
				key,
				window.setTimeout(() => {
					write(key, state);
					latest.delete(key);
				}, 150),
			);
		},
		clear(key) {
			window.clearTimeout(timers.get(key));
			latest.delete(key);
			seen.set(key, null);
			try {
				storage()?.removeItem(key);
			} catch {
				// Nothing kept, nothing to clear.
			}
		},
		claim() {
			if (claimed) return false;
			claimed = true;
			return true;
		},
	};
}

const reduced = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Follows the newest message, offers the "new message" pill, and marks unread answers. */
function follow(nav: HTMLElement, body: HTMLElement, pill: HTMLElement): void {
	let stick = true;
	const nearBottom = (): boolean => body.scrollHeight - body.scrollTop - body.clientHeight < 64;
	const toBottom = (smooth: boolean): void => {
		body.scrollTo({
			top: body.scrollHeight,
			behavior: smooth && !reduced() ? "smooth" : "auto",
		});
	};
	const open = (): boolean => nav.classList.contains("is-open");
	body.addEventListener(
		"scroll",
		() => {
			stick = nearBottom();
			if (stick) pill.hidden = true;
		},
		{ passive: true },
	);
	pill.addEventListener("click", () => {
		stick = true;
		pill.hidden = true;
		toBottom(true);
	});
	new MutationObserver((records) => {
		let changed = false;
		for (const r of records) {
			const node = r.target instanceof Element ? r.target : r.target.parentElement;
			if (!node?.closest(".pz-compass__answer")) continue;
			changed = true;
			// The visitor sent a question: their message is always brought into view.
			for (const added of r.addedNodes) {
				if (added instanceof Element && added.classList.contains("pz-exchange")) stick = true;
			}
			// An answer finished while the sheet was collapsed.
			if (
				r.type === "attributes" &&
				node.classList.contains("pz-exchange") &&
				node.getAttribute("aria-busy") === "false" &&
				!open()
			) {
				nav.setAttribute("data-unread", "");
			}
		}
		if (!changed) return;
		retireBookings(nav);
		if (stick) requestAnimationFrame(() => toBottom(false));
		else if (body.scrollHeight > body.clientHeight) pill.hidden = false;
	}).observe(body, {
		childList: true,
		subtree: true,
		characterData: true,
		attributes: true,
		attributeFilter: ["aria-busy"],
	});
	// Opening the sheet, or switching to the chat: the same conversation, at its newest message;
	// the dot goes. The destinations open at their top.
	let was = { open: open(), chat: nav.classList.contains("is-chat") };
	new MutationObserver(() => {
		const now = { open: open(), chat: nav.classList.contains("is-chat") };
		const arrived = now.open && (!was.open || (now.chat && !was.chat));
		was = now;
		if (!arrived) return;
		nav.removeAttribute("data-unread");
		pill.hidden = true;
		if (now.chat) {
			stick = true;
			requestAnimationFrame(() => requestAnimationFrame(() => toBottom(false)));
		} else {
			body.scrollTop = 0;
		}
	}).observe(nav, { attributes: true, attributeFilter: ["class"] });
}

/** Only the newest in-chat booking form stays a form; an older one becomes its summary line. */
function retireBookings(nav: HTMLElement): void {
	const live = [...nav.querySelectorAll<HTMLElement>("[data-booking-summary]:not([data-retired])")];
	for (const old of live.slice(0, -1)) {
		const bubble = old.querySelector(".pz-msg__bubble");
		const line = document.createElement("span");
		line.className = "pz-para";
		line.textContent = old.dataset.bookingSummary ?? "";
		bubble?.replaceChildren(line);
		old.setAttribute("data-retired", "");
	}
}

/** The input grows with its text up to five lines; Enter sends, Shift+Enter is a new line. */
function compose(form: HTMLFormElement, input: HTMLTextAreaElement): void {
	const grow = (): void => {
		const style = window.getComputedStyle(input);
		const line = Number.parseFloat(style.lineHeight) || 22;
		const pad = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
		input.style.height = "auto";
		const height = Math.min(input.scrollHeight, line * 5 + pad);
		input.style.height = `${height}px`;
		input.style.overflowY = input.scrollHeight > height ? "auto" : "hidden";
		form.classList.toggle("is-multiline", input.scrollHeight > line * 1.5 + pad);
	};
	input.addEventListener("input", grow);
	input.addEventListener("keydown", (e) => {
		if (e.key !== "Enter" || e.shiftKey || e.isComposing || e.keyCode === 229) return;
		e.preventDefault();
		form.requestSubmit();
	});
	// Datastar sets the value itself (sent, restored, cleared): measure again after every signal patch.
	document.addEventListener("datastar-signal-patch", () => requestAnimationFrame(grow));
	window.addEventListener("resize", grow, { passive: true });
	requestAnimationFrame(grow);
}

/** The keyboard's inset and the visible height, so the bar and the sheet stay above the keyboard. */
function fitViewport(nav: HTMLElement, form: HTMLElement): void {
	const vv = window.visualViewport;
	const place = (): void => {
		if (vv === null) return;
		const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
		nav.style.setProperty("--pz-kb", `${Math.round(inset)}px`);
		nav.style.setProperty("--pz-vvh", `${Math.round(vv.height)}px`);
	};
	vv?.addEventListener("resize", place);
	vv?.addEventListener("scroll", place);
	place();
	new ResizeObserver(() => {
		nav.style.setProperty("--pz-bar-h", `${Math.round(form.getBoundingClientRect().height)}px`);
	}).observe(form);
}

/** Dragging the sheet's handle down by more than 80px collapses it (the close button's click). */
function dragToClose(nav: HTMLElement, sheet: HTMLElement): void {
	const handle = nav.querySelector<HTMLElement>(".pz-compass__handle");
	const close = nav.querySelector<HTMLElement>(".pz-compass__close");
	if (handle === null || close === null) return;
	let start: number | null = null;
	handle.addEventListener("pointerdown", (e) => {
		start = e.clientY;
		handle.setPointerCapture(e.pointerId);
	});
	handle.addEventListener("pointermove", (e) => {
		if (start === null) return;
		sheet.style.transform = `translateY(${Math.max(0, e.clientY - start)}px)`;
	});
	const end = (e: PointerEvent): void => {
		if (start === null) return;
		const moved = e.clientY - start;
		start = null;
		sheet.style.transform = "";
		if (moved > 80) close.click();
	};
	handle.addEventListener("pointerup", end);
	handle.addEventListener("pointercancel", end);
}

/**
 * A question that never reached the guide (the connection failed before the first patch, or a newer
 * question replaced it first) has no exchange in the transcript: the page adds one from the
 * compass's template, with the note and, for a dropped one, the way to ask again.
 */
function unsent(nav: HTMLElement, form: HTMLFormElement): void {
	const region = nav.querySelector<HTMLElement>(".pz-compass__answer");
	const template = nav.querySelector<HTMLTemplateElement>("template.pz-compass__unsent");
	const input = form.querySelector<HTMLTextAreaElement>(".pz-compass__input");
	if (region === null || template === null) return;
	let next = "";
	let asking: { question: string; answered: boolean } | null = null;
	// A replaced request still reports its end: only the last one's end counts.
	let inFlight = 0;
	const add = (question: string, dropped: boolean): void => {
		const node = template.content.firstElementChild?.cloneNode(true);
		if (!(node instanceof HTMLElement)) return;
		const bubble = node.querySelector(".pz-msg__bubble");
		const note = node.querySelector<HTMLElement>(".pz-exchange__note");
		const retry = node.querySelector<HTMLElement>(".pz-exchange__retry");
		if (bubble) bubble.textContent = question;
		const span = note?.querySelector("span");
		if (span) span.textContent = (dropped ? note?.dataset.dropped : note?.dataset.unanswered) ?? "";
		if (dropped) {
			retry?.addEventListener("click", () => {
				node.remove();
				form.dispatchEvent(new CustomEvent("psi-guide-ask", { detail: question }));
			});
		} else retry?.remove();
		region.append(node);
	};
	// The question as it leaves: typed (read before the field empties) or handed over by an event.
	form.addEventListener(
		"submit",
		() => {
			next = input?.value.trim() ?? "";
		},
		{ capture: true },
	);
	form.addEventListener(
		"psi-guide-ask",
		(e) => {
			next = e instanceof CustomEvent && typeof e.detail === "string" ? e.detail.trim() : "";
		},
		{ capture: true },
	);
	new MutationObserver((records) => {
		if (asking === null) return;
		if (records.some((r) => [...r.addedNodes].some((n) => n instanceof Element && n.id !== ""))) {
			asking.answered = true;
		}
	}).observe(region, { childList: true });
	document.addEventListener("datastar-fetch", (e) => {
		if (!(e instanceof CustomEvent) || e.detail?.el !== form) return;
		const type: unknown = e.detail?.type;
		if (type === "started") {
			inFlight += 1;
			if (asking !== null && !asking.answered) add(asking.question, false);
			asking = next === "" ? null : { question: next, answered: false };
		} else if (type === "finished") {
			inFlight = Math.max(0, inFlight - 1);
			if (inFlight > 0 || asking === null) return;
			if (!asking.answered) add(asking.question, true);
			asking = null;
		}
	});
}

window.psiChat = window.psiChat ?? chatStore();

const nav = document.currentScript?.closest<HTMLElement>(".pz-compass") ?? null;
const body = nav?.querySelector<HTMLElement>(".pz-compass__body") ?? null;
const pill = nav?.querySelector<HTMLElement>(".pz-compass__pill") ?? null;
const sheet = nav?.querySelector<HTMLElement>(".pz-compass__sheet") ?? null;
const form = nav?.querySelector<HTMLFormElement>(".pz-compass__bar") ?? null;
const input = nav?.querySelector<HTMLTextAreaElement>("textarea.pz-compass__input") ?? null;
if (nav !== null && body !== null && pill !== null && sheet !== null && form !== null) {
	follow(nav, body, pill);
	fitViewport(nav, form);
	dragToClose(nav, sheet);
	unsent(nav, form);
	if (input !== null) compose(form, input);
}

export {};
