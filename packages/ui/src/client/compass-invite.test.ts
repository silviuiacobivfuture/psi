import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COMPASS_CHAT_JS } from "./compass-chat.generated";

/** A page element just big enough for the invitation: classes, attributes, listeners, children. */
class El {
	hidden = false;
	value = "";
	placeholder = "";
	tagName = "DIV";
	isContentEditable = false;
	dataset: Record<string, string> = {};
	childElementCount = 0;
	classes = new Set<string>();
	listeners = new Map<string, Array<() => void>>();
	found = new Map<string, El>();
	clicks = 0;
	readonly classList = {
		contains: (c: string) => this.classes.has(c),
		add: (c: string) => void this.classes.add(c),
		remove: (c: string) => void this.classes.delete(c),
	};
	addEventListener(type: string, fn: () => void): void {
		this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
	}
	fire(type: string): void {
		for (const fn of this.listeners.get(type) ?? []) fn();
	}
	click(): void {
		this.clicks += 1;
		this.fire("click");
	}
	querySelector(selector: string): El | null {
		return this.found.get(selector) ?? null;
	}
	contains(other: unknown): boolean {
		return other === this || [...this.found.values()].includes(other as El);
	}
	closest(): El {
		return nav;
	}
}

let nav: El;
let form: El;
let field: El;
let bubble: El;
let ask: El;
let close: El;
let answer: El;
let view: El;
let observers: Array<() => void>;
let posted: string[];
let active: El | null;
let visible: boolean;
let scroll: { y: number; height: number; view: number };
let session: Map<string, string> | "blocked";
let local: Map<string, string> | "blocked";
let reduced: boolean;

const store = (m: Map<string, string> | "blocked") => {
	if (m === "blocked") throw new Error("SecurityError");
	return {
		getItem: (k: string) => m.get(k) ?? null,
		setItem: (k: string, v: string) => void m.set(k, v),
	};
};

const kept = (m: Map<string, string> | "blocked", key: string): string | undefined =>
	m === "blocked" ? undefined : m.get(key);

/** Opens one page of the site: the compass's script runs against this fake page. */
function openPage(o: { invite?: boolean; cycle?: string } = {}): void {
	nav = new El();
	form = new El();
	field = new El();
	field.tagName = "TEXTAREA";
	bubble = new El();
	bubble.hidden = true;
	ask = new El();
	close = new El();
	answer = new El();
	view = new El();
	nav.dataset = o.invite === false ? {} : { inviteKey: "psi.chat.test", signalUrl: "/ghid/signal" };
	nav.found = new Map([
		[".pz-compass__bar", form],
		["textarea.pz-compass__input", field],
		[".pz-compass__nudge", bubble],
		[".pz-compass__nudge-ask", ask],
		[".pz-compass__nudge-close", close],
		[".pz-compass__answer", answer],
		[".pz-compass__view", view],
	]);
	form.found = new Map([["textarea", field]]);
	field.dataset = { cycle: o.cycle ?? JSON.stringify(["one", "two", "three"]) };
	field.placeholder = "one";
	observers = [];
	posted = [];
	const win = {
		addEventListener: () => undefined,
		setInterval: (fn: () => void, ms: number) => setInterval(fn, ms),
		clearInterval: (id: number) => clearInterval(id),
		setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
		matchMedia: () => ({ matches: reduced }),
		get sessionStorage() {
			return store(session);
		},
		get localStorage() {
			return store(local);
		},
		get scrollY() {
			return scroll.y;
		},
		get innerHeight() {
			return scroll.view;
		},
	};
	const doc = {
		currentScript: { closest: () => nav },
		get activeElement() {
			return active;
		},
		get visibilityState() {
			return visible ? "visible" : "hidden";
		},
		documentElement: {
			get scrollHeight() {
				return scroll.height;
			},
		},
	};
	class Observer {
		constructor(cb: () => void) {
			observers.push(cb);
		}
		observe(): void {}
	}
	const fetcher = (_url: string, init: { body: string }) => {
		posted.push(init.body);
		return Promise.resolve({});
	};
	new Function("window", "document", "HTMLElement", "MutationObserver", "fetch", COMPASS_CHAT_JS)(
		win,
		doc,
		El,
		Observer,
		fetcher,
	);
}

const events = (): string[] => posted.map((b) => JSON.parse(b).e);
const seconds = (n: number): void => void vi.advanceTimersByTime(n * 1000);

beforeEach(() => {
	vi.useFakeTimers();
	active = null;
	visible = true;
	reduced = false;
	scroll = { y: 0, height: 900, view: 900 };
	session = new Map();
	local = new Map();
});
afterEach(() => {
	vi.useRealTimers();
});

describe("the nudge", () => {
	it("waits about ten seconds on the page, then rises once and counts that it was shown", () => {
		openPage();
		seconds(9);
		expect(bubble.hidden).toBe(true);
		seconds(2);
		expect(bubble.hidden).toBe(false);
		expect(nav.classes.has("is-nudging")).toBe(true);
		expect(events()).toEqual(["nudge"]);
	});

	it("also rises after a scroll to 40 % of a page long enough to scroll", () => {
		scroll = { y: 0, height: 4000, view: 900 };
		openPage();
		seconds(2);
		expect(bubble.hidden).toBe(true);
		scroll.y = 1300;
		seconds(1);
		expect(bubble.hidden).toBe(false);
	});

	it("does not count a page that barely scrolls as scrolled", () => {
		scroll = { y: 100, height: 1000, view: 900 };
		openPage();
		seconds(5);
		expect(bubble.hidden).toBe(true);
	});

	it("is shown once per session: the next page of the same session stays quiet", () => {
		openPage();
		seconds(11);
		expect(bubble.hidden).toBe(false);
		// A new page of the same session (the fake page starts its own record of what it reported).
		openPage();
		seconds(60);
		expect(bubble.hidden).toBe(true);
		expect(posted).toEqual([]);
	});

	it("never shows without a session store, as it could not keep its promise of once", () => {
		session = "blocked";
		openPage();
		seconds(60);
		expect(bubble.hidden).toBe(true);
		expect(posted).toEqual([]);
	});

	it("does not run its clock while the tab is in the background", () => {
		visible = false;
		openPage();
		seconds(60);
		expect(bubble.hidden).toBe(true);
		visible = true;
		seconds(9);
		expect(bubble.hidden).toBe(true);
		seconds(2);
		expect(bubble.hidden).toBe(false);
	});

	for (const [why, block, clear] of [
		["the sheet is open", () => nav.classes.add("is-open"), () => nav.classes.delete("is-open")],
		[
			"a page's own ask box is on screen",
			() => nav.classes.add("is-yielding"),
			() => nav.classes.delete("is-yielding"),
		],
		[
			"the visitor is typing in the capsule",
			() => {
				active = field;
			},
			() => {
				active = null;
			},
		],
		[
			"the visitor is typing in a field of the page",
			() => {
				const other = new El();
				other.tagName = "INPUT";
				active = other;
			},
			() => {
				active = null;
			},
		],
		[
			"a draft waits in the capsule",
			() => {
				field.value = "Bună";
			},
			() => {
				field.value = "";
			},
		],
		[
			"a conversation already exists",
			() => {
				answer.childElementCount = 2;
			},
			() => {
				answer.childElementCount = 0;
			},
		],
	] as const) {
		it(`waits, never drops, while ${why}`, () => {
			openPage();
			block();
			seconds(40);
			expect(bubble.hidden).toBe(true);
			expect(kept(session, "psi.nudge.psi.chat.test")).toBeUndefined();
			clear();
			seconds(1);
			expect(bubble.hidden).toBe(false);
			expect(events()).toEqual(["nudge"]);
		});

		it(`goes away when ${why} begins while it shows`, () => {
			openPage();
			seconds(11);
			expect(bubble.hidden).toBe(false);
			block();
			seconds(1);
			expect(bubble.hidden).toBe(true);
			expect(nav.classes.has("is-nudging")).toBe(false);
			clear();
			seconds(60);
			expect(bubble.hidden).toBe(true);
			expect(events()).toEqual(["nudge"]);
		});
	}

	it("closes with its button, counting nothing more", () => {
		openPage();
		seconds(11);
		close.click();
		expect(bubble.hidden).toBe(true);
		expect(events()).toEqual(["nudge"]);
		seconds(60);
		expect(bubble.hidden).toBe(true);
	});

	it("counts the click on its invitation once and goes away", () => {
		openPage();
		seconds(11);
		ask.click();
		expect(events()).toEqual(["nudge", "nudge_click"]);
		expect(bubble.hidden).toBe(true);
	});

	it("leaves by itself after half a minute", () => {
		openPage();
		seconds(11);
		seconds(31);
		expect(bubble.hidden).toBe(true);
	});

	it("reports only the kind of step, never a text or an identifier", () => {
		openPage();
		seconds(11);
		ask.click();
		for (const body of posted) expect(Object.keys(JSON.parse(body))).toEqual(["e"]);
	});
});

describe("the placeholder", () => {
	it("moves on to the next example with a soft fade", () => {
		openPage();
		seconds(6);
		expect(field.classes.has("is-swapping")).toBe(true);
		vi.advanceTimersByTime(300);
		expect(field.classes.has("is-swapping")).toBe(false);
		expect(field.placeholder).toBe("two");
		seconds(6);
		vi.advanceTimersByTime(300);
		expect(field.placeholder).toBe("three");
		seconds(6);
		vi.advanceTimersByTime(300);
		expect(field.placeholder).toBe("one");
	});

	it("stays still under reduced motion", () => {
		reduced = true;
		openPage();
		seconds(30);
		expect(field.placeholder).toBe("one");
		expect(field.classes.has("is-swapping")).toBe(false);
	});

	it("stays still while the capsule is used, the sheet is open or the chat shows", () => {
		openPage();
		active = field;
		seconds(12);
		active = null;
		field.value = "x";
		seconds(12);
		field.value = "";
		nav.classes.add("is-chat");
		seconds(12);
		nav.classes.delete("is-chat");
		nav.classes.add("is-open");
		seconds(12);
		expect(field.placeholder).toBe("one");
	});

	it("ignores a malformed list and a single example", () => {
		openPage({ cycle: "{not json" });
		seconds(30);
		expect(field.placeholder).toBe("one");
		openPage({ cycle: JSON.stringify(["only"]) });
		seconds(30);
		expect(field.placeholder).toBe("one");
	});
});

describe("the first opening", () => {
	const open = (): void => {
		nav.classes.add("is-open");
		for (const cb of observers) cb();
	};

	it("counts a page's opening once, however often the sheet opens", () => {
		openPage();
		open();
		nav.classes.delete("is-open");
		for (const cb of observers) cb();
		open();
		expect(events()).toEqual(["open"]);
	});

	it("opens on the guide the first time on a device, so the welcome and chips show at once", () => {
		openPage();
		open();
		expect(view.clicks).toBe(1);
		expect(kept(local, "psi.welcomed.psi.chat.test")).toBe("1");
	});

	it("never again after that, nor over a visitor who is already in the chat or has a conversation", () => {
		openPage();
		open();
		openPage();
		open();
		expect(view.clicks).toBe(0);
		local = new Map();
		openPage();
		nav.classes.add("is-chat");
		open();
		expect(view.clicks).toBe(0);
		local = new Map();
		openPage();
		answer.childElementCount = 1;
		open();
		expect(view.clicks).toBe(0);
	});

	it("leaves the pages view alone when the device cannot remember", () => {
		local = "blocked";
		openPage();
		open();
		expect(view.clicks).toBe(0);
		expect(events()).toEqual(["open"]);
	});
});

describe("a compass without an invitation", () => {
	it("starts nothing: no clock, no placeholder cycle, no counters", () => {
		openPage({ invite: false });
		seconds(60);
		nav.classes.add("is-open");
		for (const cb of observers) cb();
		expect(bubble.hidden).toBe(true);
		expect(field.placeholder).toBe("one");
		expect(posted).toEqual([]);
		expect(observers).toEqual([]);
	});
});
