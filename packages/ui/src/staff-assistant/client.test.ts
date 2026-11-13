import { describe, expect, it } from "vitest";
import { STAFF_ASSISTANT_JS } from "./client.generated";

type Listener = (event: Record<string, unknown>) => void;

class Element {
	contains(): boolean {
		return false;
	}
	classes = new Set<string>();
	listeners = new Map<string, Array<Listener>>();
	clicks = 0;
	focused = 0;
	scrollTop = 0;
	scrollHeight = 1000;
	clientHeight = 200;
	style: Record<string, string> = { setProperty: "" } as unknown as Record<string, string>;
	classList = { contains: (c: string) => this.classes.has(c) };
	/** What `closest` finds: the sheet's body, when the log sits in the capsule. */
	container: Element | null = null;
	closest(): Element | null {
		return this.container;
	}
	addEventListener(type: string, fn: Listener): void {
		this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
	}
	fire(type: string, event: Record<string, unknown> = {}): void {
		for (const fn of this.listeners.get(type) ?? []) fn(event);
	}
	click(): void {
		this.clicks += 1;
		if (this.clicks % 2 === 1) this.classes.add("is-open");
		else this.classes.delete("is-open");
	}
	focus(): void {
		this.focused += 1;
	}
}
class FakeHTMLElement extends Element {}
class FakeTextArea extends FakeHTMLElement {
	value = "";
	form = {
		submits: 0,
		requestSubmit() {
			this.submits += 1;
		},
	};
	querySelector() {
		return null;
	}
}

function boot(options: { capsule?: boolean } = {}) {
	const panel = new FakeHTMLElement();
	const body = new FakeHTMLElement();
	const trigger = new FakeHTMLElement();
	const log = new FakeHTMLElement();
	const field = new FakeTextArea();
	const doc = new Element();
	const observers: Array<() => void> = [];
	const watched: Array<{ attributeFilter?: string[]; attributes?: boolean }> = [];
	(panel as unknown as { querySelector: () => unknown }).querySelector = () => field;
	const document = Object.assign(doc, {
		getElementById: (id: string) =>
			id === "staff-assistant" && options.capsule !== true
				? panel
				: id === "staff-log"
					? log
					: null,
		querySelector: (selector: string) => (selector === "[data-staff-trigger]" ? trigger : null),
		activeElement: null,
	});
	if (options.capsule === true) log.container = body;
	trigger.click = () => {
		trigger.clicks += 1;
		if (panel.classes.has("is-open")) panel.classes.delete("is-open");
		else panel.classes.add("is-open");
	};
	class Observer {
		constructor(fn: () => void) {
			observers.push(fn);
		}
		observe(_target: unknown, options: { attributeFilter?: string[]; attributes?: boolean }): void {
			watched.push(options);
		}
	}
	new Function(
		"document",
		"window",
		"MutationObserver",
		"HTMLElement",
		"HTMLTextAreaElement",
		STAFF_ASSISTANT_JS,
	)(
		document,
		{ setTimeout: (fn: () => void) => fn(), visualViewport: undefined },
		Observer,
		FakeHTMLElement,
		FakeTextArea,
	);
	const key = (init: Record<string, unknown>) => {
		const event = {
			preventDefault: () => {
				event.prevented = true;
			},
			prevented: false,
			...init,
		};
		doc.fire("keydown", event);
		return event;
	};
	return { panel, trigger, log, body, field, key, observers, watched };
}

describe("the staff panel's page script", () => {
	it("never watches the style attribute its own growing of the box writes (that loop froze the page)", () => {
		const { watched } = boot();
		const attributeWatchers = watched.filter((w) => w.attributes === true);
		expect(attributeWatchers.length).toBeGreaterThan(0);
		for (const w of attributeWatchers) {
			expect(w.attributeFilter).toBeDefined();
			expect(w.attributeFilter).not.toContain("style");
		}
	});
	it("Ctrl+K and Cmd+K toggle through the trigger, and swallow the key", () => {
		const { trigger, key, panel } = boot();
		expect(key({ ctrlKey: true, key: "k" }).prevented).toBe(true);
		expect(panel.classes.has("is-open")).toBe(true);
		key({ metaKey: true, key: "K" });
		expect(panel.classes.has("is-open")).toBe(false);
		expect(trigger.clicks).toBe(2);
	});

	it("a plain k, or Ctrl with another key, does nothing", () => {
		const { trigger, key } = boot();
		expect(key({ key: "k" }).prevented).toBe(false);
		key({ ctrlKey: true, key: "j" });
		expect(trigger.clicks).toBe(0);
	});

	it("Escape closes an open panel and is ignored when closed", () => {
		const { trigger, key } = boot();
		key({ key: "Escape" });
		expect(trigger.clicks).toBe(0);
		key({ ctrlKey: true, key: "k" });
		key({ key: "Escape" });
		expect(trigger.clicks).toBe(2);
	});

	it("Enter sends a non-empty message; Shift+Enter, composing and empty do not", () => {
		const { field } = boot();
		const press = (init: Record<string, unknown>) => {
			const event = {
				preventDefault: () => {},
				key: "Enter",
				shiftKey: false,
				isComposing: false,
				...init,
			};
			field.fire("keydown", event);
		};
		field.value = "hello";
		press({});
		expect(field.form.submits).toBe(1);
		press({ shiftKey: true });
		press({ isComposing: true });
		expect(field.form.submits).toBe(1);
		field.value = "   ";
		press({});
		expect(field.form.submits).toBe(1);
	});

	it("the log follows new messages until the person scrolls up", () => {
		const { log, observers } = boot();
		const follow = observers[observers.length - 1];
		log.scrollHeight = 1000;
		follow?.();
		expect(log.scrollTop).toBe(1000);
		log.scrollTop = 100;
		log.fire("scroll");
		log.scrollHeight = 1400;
		follow?.();
		expect(log.scrollTop).toBe(100);
		log.scrollTop = 1200;
		log.fire("scroll");
		follow?.();
		expect(log.scrollTop).toBe(1400);
	});

	it("in the capsule the sheet's body is what follows and scrolls, and the panel's keys are not bound", () => {
		const { body, log, trigger, key, observers } = boot({ capsule: true });
		const follow = observers[observers.length - 1];
		body.scrollHeight = 900;
		follow?.();
		expect(body.scrollTop).toBe(900);
		expect(log.scrollTop).toBe(0);
		body.scrollTop = 50;
		body.fire("scroll");
		body.scrollHeight = 1300;
		follow?.();
		expect(body.scrollTop).toBe(50);
		const event = key({ ctrlKey: true, key: "k" });
		expect(event.prevented).toBe(false);
		expect(trigger.clicks).toBe(0);
	});

	it("runs on a page without the panel without throwing", () => {
		expect(() =>
			new Function(
				"document",
				"window",
				"MutationObserver",
				"HTMLElement",
				"HTMLTextAreaElement",
				STAFF_ASSISTANT_JS,
			)(
				{ getElementById: () => null, querySelector: () => null, addEventListener() {} },
				{},
				class {},
				class {},
				class {},
			),
		).not.toThrow();
	});
});
