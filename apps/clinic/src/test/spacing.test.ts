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
	"/clients?new=1",
	"/clients/c1",
	"/clients/c1/notes",
	"/clients/c1/notes?new=1",
	"/clients/c1/records",
	"/clients/c1/records/new",
	"/clients/c1/records/new?form=aba-session-report",
	"/clients/c1/records/new?form=parent-questionnaire",
	"/clients/c1/files",
	"/clients/c1/files?new=1",
	"/clients/c1/appointments",
	"/clients/c4",
	"/requests",
	"/reminders?date=2026-11-16",
	"/roster",
	"/settings/roles",
	"/settings/roles?new=1",
	"/settings/people",
	"/settings/people?new=1",
	"/settings/rooms?new=1",
	"/settings/devices?new=1",
	"/settings/services?new=1",
	"/settings/audit",
	"/settings",
	"/me/settings",
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
	// 6. inside a tab, a form, a timeline or an open sheet, stacked blocks keep a gap too (the page-level rule stops at the page's children)
	for (const box of document.querySelectorAll(".cl-tab, .cl-form, .cl-notes, .cl-table, .cl-pinned-strip")) {
		if (!shown(box)) continue;
		const inner = [...box.children].filter(shown);
		for (let i = 1; i < inner.length; i++) {
			const a = inner[i - 1].getBoundingClientRect();
			const b = inner[i].getBoundingClientRect();
			if (b.top < a.bottom - 1) continue;
			if (b.top - a.bottom < 8) out.push({ rule: "blocks inside a tab or form need at least 8px between them", where: name(box) + ": " + name(inner[i - 1]) + " -> " + name(inner[i]) + " (" + Math.round(b.top - a.bottom) + "px)" });
		}
	}
	// 7. a form field in a sheet never touches the edge of the sheet
	for (const e of document.querySelectorAll(".cl-form .adm-input, .cl-form .adm-btn")) {
		if (!shown(e)) continue;
		const host = e.closest(".adm-sheet__panel");
		if (!host) continue;
		const h = host.getBoundingClientRect();
		const r = e.getBoundingClientRect();
		if (r.left < h.left + 8 || r.right > h.right - 8) out.push({ rule: "fields keep 8px from the edge of their container", where: name(e) });
	}
	// 8. a row of tabs shows all its tabs: it wraps, it never hides some behind a sideways scroll
	for (const tabs of document.querySelectorAll(".adm-tablist")) {
		if (!shown(tabs)) continue;
		if (tabs.scrollWidth > tabs.clientWidth + 1) out.push({ rule: "tabs are all in view", where: name(tabs) + " " + (tabs.scrollWidth - tabs.clientWidth) + "px hidden" });
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

describe("the guard itself refuses what it guards", () => {
	const fixture = async (markup: string): Promise<Finding[]> => {
		const context = await browser.newContext({ viewport: { width: 390, height: 800 } });
		const page = await context.newPage();
		await page.setContent(`<main><div class="adm-page">${markup}</div></main>`);
		const found = (await page.evaluate(MEASURE)) as Finding[];
		await context.close();
		return found;
	};
	it("blocks of a page that touch are found", async () => {
		const found = await fixture('<div style="height:20px">a</div><div style="height:20px">b</div>');
		expect(found.some((f) => f.rule.startsWith("blocks need"))).toBe(true);
	});
	it("blocks inside a tab or a form that touch are found", async () => {
		const found = await fixture(
			'<div class="cl-tab"><div style="display:block;height:20px">a</div><div style="display:block;height:20px">b</div></div>',
		);
		expect(found.some((f) => f.rule.startsWith("blocks inside a tab"))).toBe(true);
	});
	it("a field hard against the edge of its column is found, and a spaced one is not", async () => {
		const bad = await fixture(
			'<div class="adm-sheet__panel" style="position:relative;width:300px"><form class="cl-form"><input class="adm-input" style="position:absolute;left:0;width:100px"></form></div>',
		);
		expect(bad.some((f) => f.rule.startsWith("fields keep"))).toBe(true);
		const good = await fixture(
			'<div class="adm-sheet__panel" style="padding:16px;width:300px"><form class="cl-form"><input class="adm-input"></form></div>',
		);
		expect(good.some((f) => f.rule.startsWith("fields keep"))).toBe(false);
	});
});
