import type { Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launch } from "./browser";
import { type LiveConsole, serveConsole } from "./harness";

let live: LiveConsole;
let browser: Browser;
beforeAll(async () => {
	live = await serveConsole({ today: "2026-11-16" });
	browser = await launch();
});
afterAll(async () => {
	await browser.close();
	await live.close();
});

const SCREENS = [
	"/clients",
	"/clients/c1",
	"/requests",
	"/reminders?date=2026-11-16",
	"/roster",
	"/settings/roles",
	"/audit",
	"/stats",
	"/more",
];
const PHONES = [360, 375, 390, 430];

interface Finding {
	rule: string;
	where: string;
}

/** The layout rules, measured in a real browser: what the owner kept finding by eye, found by a test. */
const MEASURE = `(() => {
	const out = [];
	const name = (e) => e.tagName.toLowerCase() + (e.className && typeof e.className === "string" ? "." + e.className.split(" ")[0] : "");
	const shown = (e) => e.offsetParent !== null && e.getBoundingClientRect().width > 0;
	const page = document.querySelector(".adm-page");
	// 1. blocks of a page keep a gap between them
	if (page) {
		const kids = [...page.children].filter(shown);
		for (let i = 1; i < kids.length; i++) {
			const gap = kids[i].getBoundingClientRect().top - kids[i - 1].getBoundingClientRect().bottom;
			if (gap < 8) out.push({ rule: "blocks need at least 8px between them", where: name(kids[i - 1]) + " -> " + name(kids[i]) + " (" + Math.round(gap) + "px)" });
		}
	}
	// 2. a banner leading the page does not touch what follows it
	const lead = document.querySelector(".adm-lead");
	if (lead && page) {
		const gap = page.getBoundingClientRect().top - lead.getBoundingClientRect().bottom;
		if (gap < 8) out.push({ rule: "the lead banner needs a gap before the page", where: Math.round(gap) + "px" });
	}
	// 3. text never touches the border of a card, banner or button
	for (const e of document.querySelectorAll(".adm-card:not(.client-list), .adm-banner, .adm-btn, .adm-pill")) {
		if (!shown(e)) continue;
		const s = getComputedStyle(e);
		if (parseFloat(s.paddingLeft) < 6 || parseFloat(s.paddingRight) < 6) out.push({ rule: "padding of at least 6px", where: name(e) });
	}
	// 4. a toolbar's controls sit inside the page's column
	if (page) {
		const box = page.getBoundingClientRect();
		for (const e of document.querySelectorAll(".adm-toolbar > *, .adm-pagehead > *")) {
			if (!shown(e)) continue;
			const r = e.getBoundingClientRect();
			if (r.left < box.left - 1 || r.right > box.right + 1) out.push({ rule: "toolbar controls stay in the column", where: name(e) });
		}
	}
	// 5. nothing overflows the viewport sideways
	const over = document.documentElement.scrollWidth - window.innerWidth;
	if (over > 0) out.push({ rule: "no horizontal scroll", where: over + "px" });
	return out;
})()`;

const PHONE_RULES = `(() => {
	const out = [];
	const name = (e) => e.tagName.toLowerCase() + (e.className && typeof e.className === "string" ? "." + e.className.split(" ")[0] : "");
	for (const e of document.querySelectorAll("a.adm-btn, button.adm-btn, input.adm-input, select.adm-input, .adm-iconbtn, .adm-seg__item, a.adm-tab")) {
		if (e.offsetParent === null) continue;
		const r = e.getBoundingClientRect();
		if (r.height < 43.5) out.push({ rule: "touch targets of at least 44px", where: name(e) + " " + Math.round(r.height) + "px" });
		if (e.matches("input.adm-input, select.adm-input") && parseFloat(getComputedStyle(e).fontSize) < 16) out.push({ rule: "inputs of at least 16px", where: name(e) });
	}
	const walker = document.createTreeWalker(document.querySelector("main") ?? document.body, NodeFilter.SHOW_TEXT);
	for (let n = walker.nextNode(); n; n = walker.nextNode()) {
		if (!n.textContent || n.textContent.trim() === "") continue;
		const el = n.parentElement;
		if (!el || el.offsetParent === null) continue;
		if (parseFloat(getComputedStyle(el).fontSize) < 12) out.push({ rule: "text of at least 12px", where: name(el) });
	}
	const content = document.querySelector(".adm-content");
	const tabs = document.querySelector(".adm-tabs");
	if (content && tabs && tabs.offsetParent !== null) {
		const need = tabs.getBoundingClientRect().height;
		if (parseFloat(getComputedStyle(content).paddingBottom) < need) out.push({ rule: "content clears the fixed tab bar", where: getComputedStyle(content).paddingBottom });
	}
	return out;
})()`;

async function findings(width: number, path: string, phone: boolean): Promise<Finding[]> {
	const context = await browser.newContext({
		viewport: { width, height: phone ? 812 : 800 },
		hasTouch: phone,
	});
	const page = await context.newPage();
	await page.goto(`${live.url}${path}`);
	const found = (await page.evaluate(MEASURE)) as Finding[];
	const more = phone ? ((await page.evaluate(PHONE_RULES)) as Finding[]) : [];
	await context.close();
	return [...found, ...more];
}

describe("spacing and touch, measured in a real browser", () => {
	for (const width of [...PHONES, 1280]) {
		it(`${width}px: every screen keeps its gaps, paddings and targets`, async () => {
			const bad: string[] = [];
			for (const path of SCREENS) {
				for (const f of await findings(width, path, width < 600))
					bad.push(`${width} ${path}: ${f.rule} — ${f.where}`);
			}
			expect(bad).toEqual([]);
		}, 120_000);
	}
});
