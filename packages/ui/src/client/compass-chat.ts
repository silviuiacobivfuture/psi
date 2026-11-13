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
 * - retiring an older in-chat booking form (the auto-growing field, the keyboard inset and the drag
 *   handle are the capsule's own: `compass-capsule.ts`).
 */

interface Turn {
	role: "user" | "guide";
	text: string;
	refused?: string;
	/** Where a booking conversation stands (the server parses it; the page only keeps it). */
	booking?: object;
	/** The path of the page the turn was asked on (the server parses it again; the page only keeps it). */
	page?: string;
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
const MAX_PAGE = 200;
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
	const booking = field(value, "booking");
	if (typeof booking === "object" && booking !== null) turn.booking = booking;
	const page = field(value, "page");
	if (typeof page === "string" && page !== "") turn.page = page.slice(0, MAX_PAGE);
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

/**
 * While a page's own ask box (an article's "ask the guide" panel, a hub's ask bar) is on screen,
 * the floating capsule steps aside: it slides down out of view and comes back once that box has
 * scrolled away. Never while the sheet is open or the capsule holds focus or a draft.
 */
function yieldToInline(nav: HTMLElement, form: HTMLFormElement): void {
	if (!("IntersectionObserver" in window)) return;
	// The compass can be parsed before the page's own ask boxes exist: look once the page is in.
	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", () => yieldToInline(nav, form), { once: true });
		return;
	}
	const boxes = [
		...document.querySelectorAll<HTMLElement>(".pz-ask, .bl-guide, [data-guide-inline]"),
	].filter((el) => !nav.contains(el));
	if (boxes.length === 0) return;
	const visible = new Set<Element>();
	const apply = (): void => {
		const busy =
			nav.classList.contains("is-open") ||
			form.contains(document.activeElement) ||
			(form.querySelector("textarea")?.value ?? "") !== "";
		nav.classList.toggle("is-yielding", visible.size > 0 && !busy);
	};
	const io = new IntersectionObserver(
		(entries) => {
			for (const e of entries) {
				if (e.isIntersecting) visible.add(e.target);
				else visible.delete(e.target);
			}
			apply();
		},
		{ rootMargin: "0px 0px -12% 0px", threshold: 0 },
	);
	for (const b of boxes) io.observe(b);
	form.addEventListener("focusin", apply);
	new MutationObserver(apply).observe(nav, { attributes: true, attributeFilter: ["class"] });
}

const nav = document.currentScript?.closest<HTMLElement>(".pz-compass") ?? null;
const body = nav?.querySelector<HTMLElement>(".pz-compass__body") ?? null;
const pill = nav?.querySelector<HTMLElement>(".pz-compass__pill") ?? null;
const sheet = nav?.querySelector<HTMLElement>(".pz-compass__sheet") ?? null;
const form = nav?.querySelector<HTMLFormElement>(".pz-compass__bar") ?? null;
if (nav !== null && body !== null && pill !== null && sheet !== null && form !== null) {
	follow(nav, body, pill);
	unsent(nav, form);
	yieldToInline(nav, form);
}

export {};
