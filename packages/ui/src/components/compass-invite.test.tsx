/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Compass, type CompassChat, type CompassInvite } from "./compass";

const CHAT: CompassChat = {
	storageKey: "psi.chat.test",
	suggestions: ["Q1"],
	labels: {
		greeting: "GREETING",
		disclaimer: "D",
		newChat: "N",
		close: "C",
		guideTab: "G",
		pagesTab: "P",
		views: "V",
		newMessage: "M",
		placeholder: "CHAT-PLACEHOLDER",
		suggestions: "S",
		dropped: "X",
		retry: "R",
		unanswered: "U",
		fullscreen: "FS",
		exitFullscreen: "EXIT-FS",
		fullscreenOn: "FS-ON",
	},
};

const INVITE: CompassInvite = {
	label: "Întreabă-ne orice despre copilul tău",
	placeholders: ["Spune-mi ce te îngrijorează…", "Cum decurge o evaluare?", "De unde încep?"],
	nudge: {
		text: "Ai o întrebare despre ADHD? Te ajut să găsești pasul potrivit.",
		question: "Am o întrebare despre ADHD.",
		close: "Închide invitația",
	},
	signalUrl: "/ghid/signal",
};

/** The markup, without the page script (which names the same classes). */
const render = (invite?: CompassInvite): string =>
	String(
		<Compass
			label="L"
			placeholder="Ask or look for a page"
			toggleLabel="T"
			askHint="A"
			groups={[]}
			guideAction="/ghid?target=compass-answer"
			answerId="compass-answer"
			chat={CHAT}
			{...(invite === undefined ? {} : { invite })}
		/>,
	).replace(/<script[\s\S]*?<\/script>/, "");

describe("the compass invitation", () => {
	it("shows the brand's label on the capsule", () => {
		const html = render(INVITE);
		expect(html).toContain("pz-compass__invite");
		expect(html).toContain("Întreabă-ne orice despre copilul tău");
	});

	it("renders the page's nudge hidden, with its text and a named close button", () => {
		const html = render(INVITE);
		expect(html).toMatch(/class="pz-compass__nudge" role="status" hidden/);
		expect(html).toContain("Ai o întrebare despre ADHD? Te ajut să găsești pasul potrivit.");
		expect(html).toContain('aria-label="Închide invitația"');
	});

	it("asks the nudge's question through the capsule's own ask path when it is clicked", () => {
		const html = render(INVITE);
		expect(html).toContain("psi-guide-ask");
		expect(html).toContain("Am o întrebare despre ADHD.");
	});

	it("puts the page's own placeholder first and hands the page script the rest to cycle", () => {
		const html = render(INVITE);
		expect(html).toContain('placeholder="Spune-mi ce te îngrijorează…"');
		expect(html).toContain("data-cycle=");
		expect(html).toContain("Cum decurge o evaluare?");
		// The accessible name stays the stable one; the chat view keeps its own placeholder.
		expect(html).toContain('aria-label="Ask or look for a page"');
		expect(html).toContain("CHAT-PLACEHOLDER");
	});

	it("tells the page script where it reports and under which key it remembers", () => {
		const html = render(INVITE);
		expect(html).toContain('data-invite-key="psi.chat.test"');
		expect(html).toContain('data-signal-url="/ghid/signal"');
	});

	it("does not cycle a single placeholder and shows no nudge when the page has none", () => {
		const html = render({ label: "L", placeholders: ["Only one"] });
		expect(html).not.toContain("data-cycle");
		expect(html).not.toContain("pz-compass__nudge");
		expect(html).toContain('placeholder="Only one"');
	});

	it("is exactly the old capsule without an invitation", () => {
		const html = render();
		expect(html).not.toContain("pz-compass__invite");
		expect(html).not.toContain("pz-compass__nudge");
		expect(html).not.toContain("data-invite-key");
		expect(html).toContain('placeholder="Ask or look for a page"');
	});

	it("keeps the nudge inside the compass, which the page registry never reads as page text", () => {
		const html = render(INVITE);
		expect(html.indexOf("pz-compass__nudge")).toBeGreaterThan(html.indexOf("<nav"));
		expect(html.indexOf("pz-compass__nudge")).toBeLessThan(html.indexOf("</nav>"));
	});
});

const css = (name: string): string =>
	readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), "utf8");

/** The text of the last `@media (prefers-reduced-motion: reduce)` block. */
function reducedMotion(source: string): string {
	const at = source.lastIndexOf("@media (prefers-reduced-motion: reduce)");
	return at < 0 ? "" : source.slice(at);
}

describe("the glow and reduced motion", () => {
	const glow = css("ai-glow.css");

	it("turns and breathes only without a reduced-motion preference", () => {
		for (const name of ["pz-aura-spin", "pz-aura-breathe"]) {
			expect(glow).toContain(`@keyframes ${name}`);
		}
		const still = reducedMotion(glow);
		expect(still).toContain(".pz-compass__bar::before");
		expect(still).toContain(".pz-compass__bar::after");
		expect(still).toContain(".pz-ask__bar::after");
		expect(still.match(/animation: none/g)?.length).toBeGreaterThanOrEqual(1);
	});

	it("keeps a static, lit aura under reduced motion, flat finish included", () => {
		const still = reducedMotion(glow);
		expect(still).toMatch(/opacity: 0\.75/);
		expect(still).not.toContain("data-finish");
	});

	it("gives the capsule and the page's own ask bar the same glow", () => {
		expect(glow).toMatch(/\.pz-compass__bar::before,\s*\.pz-ask__bar::before/);
		expect(glow).toMatch(/\.pz-compass__bar::after,\s*\.pz-ask__bar::after/);
	});

	it("brings the ring back on the flat finish, which hides every edge light, for the AI input only", () => {
		expect(glow).toMatch(
			/\[data-finish="flat"\] \.pz-compass \.pz-compass__bar::before,\s*\[data-finish="flat"\] \.pz-ask \.pz-ask__bar::before\s*\{\s*display: block/,
		);
		expect(glow).not.toContain("pz-aura-ripple");
	});

	it("gives Psizone its turquoise and luminous golds, and keeps the deep gold out of the blur", () => {
		const psizone = glow.slice(
			glow.indexOf('[data-theme^="psizone"]'),
			glow.indexOf('[data-theme^="blog"]'),
		);
		expect(psizone).toContain("--glow-2");
		expect(psizone).toContain("--glow-3");
		expect(psizone).not.toContain("--glow-1");
	});

	it("keeps the blog to its own teal: its glow uses no second or third light", () => {
		const blog = glow.slice(
			glow.indexOf('[data-theme^="blog"]'),
			glow.indexOf(".pz-compass__bar,\n.pz-ask__bar {"),
		);
		expect(blog).toContain("--glow-1");
		expect(blog).not.toMatch(/--glow-[23]/);
	});

	it("stops the nudge's rise and the label's slide under reduced motion", () => {
		const still = reducedMotion(css("compass-invite.css"));
		expect(still).toMatch(/\.pz-compass__nudge-card\s*\{\s*animation: none/);
		expect(still).toMatch(/\.pz-compass__invite\s*\{\s*transition: none/);
	});

	it("hides the nudge while the sheet is open or the capsule has stepped aside", () => {
		const source = css("compass-invite.css");
		expect(source).toContain(".pz-compass.is-open .pz-compass__nudge");
		expect(source).toContain(".pz-compass.is-yielding .pz-compass__nudge");
	});
});
