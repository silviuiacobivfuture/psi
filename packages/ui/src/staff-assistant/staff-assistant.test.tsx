/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { STAFF_EN, STAFF_RO, type StaffCard } from "@psi/engine/staff";
import { describe, expect, it } from "vitest";
import { compileClients } from "../client/build";
import { CardView } from "./cards";
import { STAFF_ASSISTANT_JS } from "./client.generated";
import { StaffPanel } from "./panel";
import { jsString, safeHref } from "./safe";
import { staffViews } from "./views";

const BASE = "/assistant";
const esc = (s: string): string =>
	s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
const PAGE = { screen: "client", clientId: "c1" } as const;

function render(element: { toString(): string | Promise<string> }): string {
	const out = element.toString();
	if (typeof out !== "string") throw new Error("async render");
	return out;
}

const panel = (
	locale: "ro" | "en" = "ro",
	suggestions: ReadonlyArray<string> = ["a", "b", "c", "d"],
) =>
	render(
		<StaffPanel
			labels={(locale === "ro" ? STAFF_RO : STAFF_EN).panel}
			base={BASE}
			page={PAGE}
			suggestions={suggestions}
			threadId="thread1"
		/>,
	);

describe("the panel", () => {
	it.each([
		["ro", STAFF_RO],
		["en", STAFF_EN],
	] as const)("is a labelled dialog with every word from the %s copy", (locale, copy) => {
		const html = panel(locale);
		expect(html).toContain('role="dialog"');
		expect(html).toContain(`aria-label="${esc(copy.panel.sheetLabel)}"`);
		expect(html).toContain(esc(copy.panel.placeholder));
		expect(html).toContain(esc(copy.panel.empty));
		expect(html).toContain(copy.panel.shortcut);
		expect(html).toContain(`title="${copy.panel.newChat}"`);
		expect(html).toContain(`aria-label="${copy.panel.close}"`);
		expect(html).toContain(`aria-label="${copy.panel.send}"`);
	});

	it("starts closed and inert, and its trigger controls it", () => {
		const html = panel();
		expect(html).toContain('data-signals="{&quot;staff&quot;:{&quot;open&quot;:false');
		expect(html).toContain('aria-controls="staff-assistant"');
		expect(html).toContain("data-attr:inert");
		expect(html).toContain("data-staff-trigger");
	});

	it("knows the open screen and the conversation", () => {
		const html = panel();
		expect(html).toContain("&quot;clientId&quot;:&quot;c1&quot;");
		expect(html).toContain("&quot;threadId&quot;:&quot;thread1&quot;");
	});

	it("offers at most three suggestions, each a button that sends its text", () => {
		const html = panel();
		expect(html.match(/class="sa-chipbtn"/g)).toHaveLength(3);
		expect(html).not.toContain(">d<");
		expect(html).toContain("$staff.message = ");
		expect(html).toContain("/assistant/chat");
		expect(panel("ro", [])).not.toContain("sa-chipbtn");
	});

	it("posts to the mounted base, asks for the briefing once, and its field is bound", () => {
		const html = panel();
		expect(html).toContain("/assistant/briefing");
		expect(html).toContain("$staff.briefed");
		expect(html).toContain('data-bind="staff.message"');
		expect(html).toContain("maxlength");
		expect(html).toContain('type="submit"');
	});

	it("inlines the page script once, and it is not the visitor sites' script", () => {
		expect((panel().match(/<script>/g) ?? []).length).toBe(1);
		expect(STAFF_ASSISTANT_JS).not.toContain("psiChat");
	});
});

describe("cards are drawn from data and escape everything", () => {
	const ctx = { labels: STAFF_EN.panel, base: BASE };
	const HOSTILE = '<img src=x onerror="alert(1)">';
	const cards: ReadonlyArray<StaffCard> = [
		{
			kind: "agenda",
			title: HOSTILE,
			empty: "none",
			rows: [{ title: HOSTILE, subtitle: HOSTILE, badge: HOSTILE, tone: "bad" }],
		},
		{ kind: "list", title: "t", empty: "none", rows: [] },
		{ kind: "client", title: HOSTILE, lines: [{ label: HOSTILE, value: HOSTILE }], note: HOSTILE },
		{
			kind: "slots",
			title: "t",
			empty: "none",
			slots: [{ label: HOSTILE, detail: HOSTILE, ask: HOSTILE }],
		},
		{ kind: "choices", title: "t", options: [{ label: HOSTILE, ask: "$x @post('/x')" }] },
		{ kind: "stats", title: "t", metrics: [{ label: HOSTILE, value: "1" }] },
		{
			kind: "briefing",
			title: "t",
			clear: HOSTILE,
			sections: [
				{
					title: HOSTILE,
					tone: "warn",
					items: [{ text: HOSTILE, ask: HOSTILE }, { text: "plain" }],
				},
			],
		},
		{
			kind: "proposal",
			proposalId: "prop_1",
			title: HOSTILE,
			lines: [{ label: "a", value: HOSTILE }],
			destructive: true,
			expiresAt: 1,
		},
		{
			kind: "result",
			proposalId: "prop_1",
			ok: true,
			title: HOSTILE,
			lines: [{ label: "", value: HOSTILE }],
			links: [{ label: HOSTILE, href: "https://wa.me/40712000001?text=hi" }],
			undo: { proposalId: "prop_2", label: "Undo" },
		},
	];

	it.each(
		cards.map((c) => [c.kind, c] as const),
	)("%s: nothing hostile becomes markup", (_kind, card) => {
		const html = render(<CardView card={card} ctx={ctx} />);
		expect(html).not.toContain("<img");
		expect(html).not.toContain('onerror="');
	});

	it("an empty list says so", () => {
		expect(render(<CardView card={cards[1] as StaffCard} ctx={ctx} />)).toContain("none");
	});

	it("a chosen slot or option sends its own text, with $ and @ defused", () => {
		const html = render(<CardView card={cards[4] as StaffCard} ctx={ctx} />);
		expect(html).toContain("data-on:click");
		expect(html).not.toContain("$x @post");
		expect(html).toContain("\\u0024x \\u0040post");
	});

	it("the proposal has one Confirm that posts the confirmation for exactly its id, and a Dismiss", () => {
		const html = render(<CardView card={cards[7] as StaffCard} ctx={ctx} />);
		expect(html.match(/sa-btn--primary/g)).toHaveLength(1);
		expect(html).toContain("/assistant/confirm?proposal=prop_1");
		expect(html).toContain("/assistant/dismiss?proposal=prop_1");
		expect(html).toContain(STAFF_EN.panel.confirm);
		expect(html).toContain(STAFF_EN.panel.dismiss);
		expect(html).toContain("is-destructive");
		expect(html).toContain('id="sa-card-prop_1"');
		expect(html).toContain("el.disabled = true");
	});

	it("a result with an undo takes the undo's id, so the undo's own result replaces it", () => {
		const html = render(<CardView card={cards[8] as StaffCard} ctx={ctx} />);
		expect(html).toContain('id="sa-card-prop_2"');
		expect(html).toContain("/assistant/confirm?proposal=prop_2");
		expect(html).toContain('href="https://wa.me/40712000001?text=hi"');
		expect(html).toContain('rel="noopener noreferrer"');
	});
});

describe("links", () => {
	it.each([
		["/clients/c1", "/clients/c1"],
		["https://wa.me/40712000001?text=hi%20there", "https://wa.me/40712000001?text=hi%20there"],
		["javascript:alert(1)", undefined],
		["//evil.example/x", undefined],
		["https://evil.example/", undefined],
		["https://wa.me.evil.example/1", undefined],
		['/x" onmouseover="y', undefined],
		[undefined, undefined],
	] as const)("%s", (input, expected) => {
		expect(safeHref(input)).toBe(expected);
	});

	it("string literals cannot read as signals or actions", () => {
		const out = jsString('$x @post("/y") </script>');
		expect(out).not.toMatch(/[$@<>]/);
		expect(JSON.parse(out.replace(/\\u00([0-9a-f]{2})/g, (_, h: string) => `\\u00${h}`))).toBe(
			'$x @post("/y") </script>',
		);
	});
});

describe("the views the routes draw with", () => {
	const views = staffViews(STAFF_EN.panel, BASE);

	it("the exchange is appended to the log with its message escaped and a thinking indicator", () => {
		const patch = views.exchange({ id: "x1", message: "<b>hi</b>" });
		expect(patch).toMatchObject({ selector: "#staff-log", mode: "append" });
		expect(patch.html).toContain("&lt;b&gt;hi&lt;/b&gt;");
		expect(patch.html).toContain('id="sa-text-x1"');
		expect(patch.html).toContain('id="sa-dots-x1"');
		expect(patch.html).toContain(STAFF_EN.panel.thinking);
	});

	it("a chip is appended while running and then replaced in place", () => {
		const running = views.chip({ id: "x1", callId: "call1", label: "Looking…", phase: "running" });
		const done = views.chip({ id: "x1", callId: "call1", label: "Found", phase: "done" });
		expect(running).toMatchObject({ selector: "#sa-chips-x1", mode: "append" });
		expect(done.selector).toBeUndefined();
		expect(running.html).toContain('id="sa-chip-call1"');
		expect(done.html).toContain('id="sa-chip-call1"');
		expect(done.html).not.toContain("sa-chip__spin");
		expect(views.chip({ id: "x1", callId: "c", label: "No", phase: "refused" }).html).toContain(
			"sa-chip--refused",
		);
	});

	it("the text replaces itself by id, in paragraphs, escaped", () => {
		const patch = views.text({ id: "x1", text: "One <i>x</i>\n\nTwo" });
		expect(patch.selector).toBeUndefined();
		expect(patch.html).toContain('id="sa-text-x1"');
		expect(patch.html).toContain("<p>One &lt;i&gt;x&lt;/i&gt;</p><p>Two</p>");
	});

	it("done clears the indicator; a refusal explains in the person's words", () => {
		expect(views.done({ id: "x1" })).toMatchObject({ selector: "#sa-dots-x1", mode: "outer" });
		const refusal = views.refusal({ id: "x1", reason: "rate_limited" });
		expect(refusal.html).toContain(esc(STAFF_EN.panel.refusals.rate_limited));
		expect(refusal.html).toContain('role="alert"');
		for (const reason of [
			"no_principal",
			"rate_limited",
			"invalid",
			"unavailable",
			"language",
		] as const) {
			expect(views.refusal({ id: "x", reason }).html).toContain(
				esc(STAFF_EN.panel.refusals[reason]),
			);
		}
	});

	it("a card is appended to its exchange; the briefing and results go where they belong", () => {
		const card: StaffCard = { kind: "list", title: "t", empty: "e", rows: [] };
		expect(views.card({ id: "x1", card })).toMatchObject({
			selector: "#sa-cards-x1",
			mode: "append",
		});
		expect(views.briefing({ card })).toMatchObject({ selector: "#sa-briefing", mode: "outer" });
		const outcome = {
			status: "done" as const,
			card: {
				kind: "result" as const,
				proposalId: "prop_1",
				ok: true,
				title: "Done",
				lines: [],
				links: [],
				undo: { proposalId: "prop_2", label: "Undo" },
			},
		};
		const result = views.result({ outcome });
		expect(result.selector).toBe("#sa-card-prop_1");
		expect(result.html).toContain('id="sa-card-prop_2"');
		expect(views.dismissed({ proposalId: "prop_1" })).toMatchObject({
			selector: "#sa-card-prop_1",
			mode: "outer",
		});
		expect(views.dismissed({ proposalId: "prop_1" }).html).toContain(STAFF_EN.panel.dismissed);
	});
});

describe("the page script", () => {
	it("is current: regenerate with `pnpm --filter @psi/ui build:staff-client`", () => {
		const source = readFileSync(fileURLToPath(new URL("./client.ts", import.meta.url)), "utf8");
		expect(STAFF_ASSISTANT_JS).toBe(compileClients([source]));
	});
});
