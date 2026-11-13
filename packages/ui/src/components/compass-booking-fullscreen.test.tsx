/** @jsxRuntime automatic @jsxImportSource hono/jsx */
// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import { installBrowser, key, mount, tick } from "./fullscreen-harness";

installBrowser();

describe("booking goes full screen at once", () => {
	it("on the capsule's action", async () => {
		const m = mount();
		m.open();
		await tick(0);
		m.nav.querySelector<HTMLElement>(".pz-compass__action a")?.click();
		expect(m.full()).toBe(true);
	});

	it("on the capsule's action while the sheet is shut: it opens the chat, then goes full screen", async () => {
		const m = mount();
		const orb = m.nav.querySelector<HTMLElement>(".pz-compass__orb");
		const guide = m.nav.querySelector<HTMLElement>(".pz-compass__view");
		orb?.addEventListener("click", () => m.nav.classList.add("is-open"));
		guide?.addEventListener("click", () => m.nav.classList.add("is-chat"));
		m.nav.querySelector<HTMLElement>(".pz-compass__action a")?.click();
		await tick(0);
		expect(m.full()).toBe(true);
	});

	it("on a Programează button in the conversation", async () => {
		const m = mount();
		m.open();
		await tick(0);
		m.answer.insertAdjacentHTML(
			"beforeend",
			'<button type="button">Programează evaluarea</button>',
		);
		m.answer.querySelector("button")?.click();
		expect(m.full()).toBe(true);
		expect(m.live.textContent).toBe("");
	});

	it("on a Programează link, and on a suggestion chip, but not on other buttons", async () => {
		const m = mount();
		m.open();
		await tick(0);
		m.answer.insertAdjacentHTML("beforeend", '<a href="/x">Citește mai mult</a>');
		m.answer.querySelector("a")?.click();
		expect(m.full()).toBe(false);
		m.answer.insertAdjacentHTML("beforeend", '<a href="/c">Programează-te</a>');
		m.answer.querySelectorAll("a")[1]?.click();
		expect(m.full()).toBe(true);
		m.fs.click();
		const chip = document.createElement("button");
		chip.textContent = "Programează o evaluare";
		m.nav.querySelector(".pz-compass__chat")?.append(chip);
		m.newChat.click();
		chip.click();
		expect(m.full()).toBe(true);
	});

	it("when the guide's answer renders the slot picker or the booking form, announced", async () => {
		const m = mount();
		m.open();
		await tick(0);
		m.answer.insertAdjacentHTML("beforeend", '<div class="pz-exchange"><p>text only</p></div>');
		await tick(0);
		expect(m.full()).toBe(false);
		m.answer.insertAdjacentHTML(
			"beforeend",
			'<div class="pz-exchange"><div data-booking-summary="s"><div class="pz-slots"></div></div></div>',
		);
		await tick(0);
		expect(m.full()).toBe(true);
		expect(m.live.textContent).toBe("Ecran complet activat");
	});

	it("not for a retired form, nor with the sheet shut", async () => {
		const m = mount();
		m.answer.insertAdjacentHTML("beforeend", '<div data-booking-summary="s"></div>');
		await tick(0);
		expect(m.full()).toBe(false);
		m.open();
		await tick(0);
		m.answer.insertAdjacentHTML("beforeend", '<div data-booking-summary="s" data-retired></div>');
		await tick(0);
		expect(m.full()).toBe(false);
	});

	it("never after a manual exit in this conversation, until a new one", async () => {
		const m = mount();
		m.open();
		await tick(0);
		m.fs.click();
		m.fs.click();
		m.nav.querySelector<HTMLElement>(".pz-compass__action a")?.click();
		expect(m.full()).toBe(false);
		m.answer.insertAdjacentHTML("beforeend", '<button type="button">Programează</button>');
		m.answer.querySelector("button")?.click();
		m.answer.insertAdjacentHTML("beforeend", '<div data-booking-summary="s"></div>');
		await tick(0);
		expect(m.full()).toBe(false);
		m.newChat.click();
		m.nav.querySelector<HTMLElement>(".pz-compass__action a")?.click();
		expect(m.full()).toBe(true);
	});

	it("honours Escape like any other entry", async () => {
		const m = mount();
		m.open();
		await tick(0);
		m.nav.querySelector<HTMLElement>(".pz-compass__action a")?.click();
		key(document.body, "Escape");
		expect(m.full()).toBe(false);
		expect(m.nav.classList.contains("is-open")).toBe(true);
	});
});

describe("the style", () => {
	const css = readFileSync(join(process.cwd(), "src/compass-fullscreen.css"), "utf8");
	it("suppresses every transition and animation under reduced motion", () => {
		const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
		const outside = css.slice(0, css.indexOf("@media (prefers-reduced-motion: reduce)"));
		expect(outside).toMatch(/animation: pz-compass-fs-in/);
		expect(outside).toMatch(/transition: background-color/);
		expect(reduced).toMatch(/\.pz-compass,[^{]*\{\s*transition: none/);
		expect(reduced).toMatch(/is-fullscreen\.is-open \.pz-compass__sheet \{\s*animation: none/);
	});
	it("takes colour only from token roles", () => {
		expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
	});
});

describe("accessibility (structure; colour contrast is checked per theme in a real browser)", () => {
	for (const state of ["normal", "full screen"] as const) {
		it(`has no WCAG 2.2 AA violations in ${state}`, async () => {
			const m = mount();
			m.open();
			await tick(0);
			if (state === "full screen") m.fs.click();
			vi.useRealTimers();
			const result = await axe.run(m.nav, {
				runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
				rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
			});
			expect(result.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
		});
	}
});
