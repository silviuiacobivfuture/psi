/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { STAFF_EN, STAFF_RO, STAFF_SCREENS } from "@psi/engine/staff";
import { describe, expect, it } from "vitest";
import { StaffCapsule } from "./capsule";
import { StaffTrigger } from "./panel";

const BASE = "/assistant";
const PAGE = { screen: "client", clientId: "c1" } as const;
const esc = (s: string): string =>
	s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");

function render(element: { toString(): string | Promise<string> }): string {
	const out = element.toString();
	if (typeof out !== "string") throw new Error("async render");
	return out;
}

const capsule = (
	locale: "ro" | "en" = "ro",
	suggestions: ReadonlyArray<string> = ["a", "b", "c", "d"],
	page: Parameters<typeof StaffCapsule>[0]["page"] = PAGE,
) =>
	render(
		<StaffCapsule
			labels={(locale === "ro" ? STAFF_RO : STAFF_EN).panel}
			base={BASE}
			page={page}
			suggestions={suggestions}
			threadId="thread1"
		/>,
	);

describe("the capsule", () => {
	it.each([
		["ro", STAFF_RO],
		["en", STAFF_EN],
	] as const)("is a labelled capsule with every word from the %s copy", (locale, copy) => {
		const html = capsule(locale);
		expect(html).toContain('class="pz-compass pz-compass--admin sa-root"');
		expect(html).toContain(`aria-label="${esc(copy.panel.sheetLabel)}"`);
		expect(html).toContain(esc(copy.panel.placeholders.client));
		expect(html).toContain(esc(copy.panel.empty));
		expect(html).toContain(esc(copy.panel.fullscreen));
		expect(html).toContain(esc(copy.panel.exitFullscreen));
		expect(html).toContain(esc(copy.panel.fullscreenOn));
		expect(html).toContain(`aria-label="${esc(copy.panel.close)}"`);
		expect(html).toContain(`aria-label="${esc(copy.panel.send)}"`);
		expect(html).toContain(esc(copy.panel.newChat));
		expect(html).toContain(copy.panel.shortcut);
	});

	it("has a placeholder written for every screen, in both languages", () => {
		for (const copy of [STAFF_RO, STAFF_EN])
			for (const screen of STAFF_SCREENS) {
				const text = copy.panel.placeholders[screen];
				expect(text.length).toBeGreaterThan(8);
				expect(capsule(copy.locale, [], { screen })).toContain(esc(text));
			}
	});

	it("keeps the capsule's class contract, which the shared page script and the glow depend on", () => {
		const html = capsule();
		for (const cls of [
			"pz-compass__sheet",
			"pz-compass__bar",
			"pz-compass__input",
			"pz-compass__orb",
			"pz-compass__fs",
			"pz-compass__new",
			"pz-compass__close",
			"pz-compass__body",
			"pz-compass__fs-live",
		])
			expect(html).toContain(cls);
		expect(html).toContain('data-class:is-open="$compassOpen"');
		expect(html).toContain('data-class:is-chat="$compassChat"');
		expect(html).toContain("&quot;compassChat&quot;:true");
	});

	it("shares the conversation with the panel: the same log id, the same route, the same signals", () => {
		const html = capsule();
		expect(html).toContain('id="staff-log"');
		expect(html).toContain('id="sa-briefing"');
		expect(html).toContain('data-bind="staff.message"');
		expect(html).toContain("@post(&quot;/assistant/chat&quot;)");
		expect(html).toContain("@get(&quot;/assistant/briefing&quot;)");
		expect(html).toContain("&quot;threadId&quot;:&quot;thread1&quot;");
		expect(html).toContain("&quot;clientId&quot;:&quot;c1&quot;");
	});

	it("the orb controls the sheet by id, and the field's form controls the log", () => {
		const html = capsule();
		expect(html).toContain('id="pz-staff-sheet"');
		expect(html).toContain('aria-controls="pz-staff-sheet"');
		expect(html).toContain('aria-controls="staff-log"');
	});

	it("an empty draft cannot be sent: the button is disabled while it is empty and Enter sends only a draft", () => {
		const html = capsule();
		expect(html).toContain("$staff.message.trim() === &#39;&#39;");
		expect(html).toContain("if ($staff.message.trim() !== &#39;&#39;)");
	});

	it("offers at most three suggestions, each sending its own words, escaped", () => {
		const html = capsule("ro", ["unu", "doi", "trei", "patru"]);
		expect(html.split("sa-chipbtn").length - 1).toBe(3);
		expect(html).not.toContain("patru");
		const hostile = capsule("ro", ['x" @post("/evil") $a']);
		expect(hostile).not.toContain('@post("/evil")');
		expect(hostile).toContain("\\u0040post");
	});

	it("no suggestions: no row for them", () => {
		expect(capsule("ro", [])).not.toContain("sa__suggest");
	});

	it("ships the full screen and the staff page script, and not the guide's conversation store", () => {
		const html = capsule();
		expect(html.split("<script").length - 1).toBe(2);
		expect(html).toContain("pz-compass__fs");
		expect(html).not.toContain("psiChat");
		expect(html).not.toContain("compassTurns");
	});

	it("Ctrl or Cmd+K toggles it and Escape closes it", () => {
		const html = capsule();
		expect(html).toContain("data-on:keydown__window");
		expect(html).toContain("evt.ctrlKey || evt.metaKey");
		expect(html).toContain("evt.key === &#39;Escape&#39;");
	});

	it("a new conversation empties the log's exchanges and changes the thread", () => {
		const html = capsule();
		expect(html).toContain(".sa-x");
		expect(html).toContain("$staff.threadId = crypto.randomUUID()");
	});
});

describe("the trigger", () => {
	const trigger = (presentation: "panel" | "capsule") =>
		render(
			<StaffTrigger
				labels={STAFF_RO.panel}
				base={BASE}
				variant="bar"
				presentation={presentation}
			/>,
		);

	it("opens the capsule's sheet when that is what the page has, and says so to assistive tech", () => {
		const html = trigger("capsule");
		expect(html).toContain('aria-controls="pz-staff-sheet"');
		expect(html).toContain("$compassOpen = !$compassOpen");
		expect(html).not.toContain("data-staff-trigger");
	});

	it("opens the side panel otherwise, as it always did", () => {
		const html = trigger("panel");
		expect(html).toContain('aria-controls="staff-assistant"');
		expect(html).toContain("data-staff-trigger");
		expect(html).toContain("$staff.open = !$staff.open");
	});
});
