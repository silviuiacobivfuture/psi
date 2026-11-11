// PDFCraft wearing the estate, checked in a real browser — what only a rendered
// page can show. Run by routing.sh against the same hardened container.
//
//   node gitops/services/pdfcraft/selftest/browser.mjs <baseUrl>
//
// NAMED CASES, per page and per theme (light, dark):
//   B1  their header (logo, pill navigation, "Studio NEW", search, theme toggle) is not shown
//   B2  their footer is not shown
//   B3  their hero (the page's h1 section: gradient headline, "132+", big search) is not shown
//   B4  no visible element paints its text with background-clip:text
//   B5  no visible "NEW" / "Nou" badge
//   B6  the credit is there once, says „realizat cu PDFCraft”, links to the project, opens a new tab
//   B7  the page is painted on the estate's background (the default theme's --background)
//   B8  no visible link to GitHub or X other than the credit
//   B9  their automatic update check is switched off before it can call GitHub
//   B10 no console error, no page error (React reports a hydration mismatch as
//       one) and no failed request
//   B11 the estate's bar is mounted, with exactly the four sections, and the page's
//       own section alone marked aria-current="page" (desktop and phone rows alike)
//   B12 the bar's account shows the person the gate passed (X-authentik-name)
//   B13 a navigation by THEIR router (history.pushState) moves the current section
//   B14 no visible element reads as an English tool name, tool description or
//       mapped message (base/ro-overrides.json "texts", "messages") — also on the
//       Studio and the workflow editor, which list the tools from a JS chunk
//   B15 a click on a tool card goes through THEIR router (the .txt route payload,
//       rewritten) and lands on the tool in Romanian, with no console error
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..");
const require = createRequire(join(repo, "package.json"));
const { chromium } = require(
	require.resolve("playwright", { paths: [join(repo, "node_modules/.pnpm/node_modules")] }),
);

const base = process.argv[2];
const PAGES = ["/ro/tools/", "/ro/tools/merge-pdf/", "/ro/faq/"];
// The section each page belongs to, as the bar names it.
const SECTION = {
	"/ro/tools/": "Instrumente",
	"/ro/tools/merge-pdf/": "Instrumente",
	"/ro/faq/": "Întrebări frecvente",
};
const SECTIONS = ["Instrumente", "Studio", "Flux de lucru", "Întrebări frecvente"];
// What Traefik passes once the gate admits someone. ASCII on purpose: a browser
// sends header values as Latin-1, so a test-injected "Ș" arrives as "?" — the
// harness's limit, not the product's. A UTF-8 name (raw bytes, as the outpost
// sends them) is proven by routing.sh's curl case instead.
const PERSON = { name: "Ana Pop", email: "ana@exemplu.test" };
// The default estate theme's page colour, as the browser computes it.
const GROUND = { light: "oklch(0.985 0.004 262)", dark: "oklch(0.17 0.013 262)" };
// Every English string the map translates, and where B15 must land.
const MAP = JSON.parse(readFileSync(join(repo, "pieces/pdfcraft/base/ro-overrides.json"), "utf8"));
// "Odd", "of", "Top": too short to tell from any other word on a page.
const ENGLISH = [
	...Object.keys(MAP.texts),
	...Object.values(MAP.messages).flatMap((m) => Object.keys(m)),
].filter((t) => t.length > 4);
const CARD = { href: "/ro/tools/merge-pdf/", h1: MAP.texts["Combine Files & Merge PDF"] };
// Visible elements whose OWN text is exactly one of `english` — never a
// container that merely holds one.
const englishShown = (english) => {
	const set = new Set(english);
	const out = [];
	for (const e of document.querySelectorAll("body *")) {
		const own = [...e.childNodes]
			.filter((n) => n.nodeType === 3)
			.map((n) => n.textContent)
			.join("")
			.trim();
		const r = e.getBoundingClientRect();
		if (own && set.has(own) && r.width > 0 && r.height > 0) out.push(own);
	}
	return out;
};

let pass = 0;
let fail = 0;
const ok = (label) => {
	pass++;
	console.log(`  ok   ${label}`);
};
const bad = (label, why) => {
	fail++;
	console.log(`  FAIL ${label}\n       ${why}`);
};
const check = (label, cond, why) => (cond ? ok(label) : bad(label, why));

const browser = await chromium.launch();
for (const theme of ["light", "dark"]) {
	const ctx = await browser.newContext({
		viewport: { width: 1280, height: 900 },
		colorScheme: theme,
		extraHTTPHeaders: { "X-authentik-name": PERSON.name, "X-authentik-email": PERSON.email },
	});
	await ctx.addInitScript((t) => {
		try {
			localStorage.setItem("theme", t);
		} catch {}
	}, theme);
	for (const path of PAGES) {
		const page = await ctx.newPage();
		const errors = [];
		const github = [];
		page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 140)));
		page.on("requestfailed", (r) => errors.push(`failed ${r.url().slice(0, 100)}`));
		// React reports a hydration mismatch (server markup vs payload) as a page error.
		page.on("pageerror", (e) => errors.push(`pageerror ${String(e).slice(0, 140)}`));
		page.on(
			"request",
			(r) => /api\.github\.com|ghproxy|gh-proxy/.test(r.url()) && github.push(r.url()),
		);
		await page.goto(base + path, { waitUntil: "networkidle", timeout: 90000 });
		await page.waitForTimeout(1500);
		const s = await page.evaluate(() => {
			const shown = (e) => {
				const r = e.getBoundingClientRect();
				const c = getComputedStyle(e);
				return c.display !== "none" && c.visibility !== "hidden" && r.width > 0 && r.height > 0;
			};
			const visible = (sel) => [...document.querySelectorAll(sel)].filter(shown);
			const clip = [...document.querySelectorAll("body *")].filter((e) => {
				const c = getComputedStyle(e);
				// Gradient text = clipped background AND transparent glyphs.
				return (
					shown(e) &&
					(c.backgroundClip === "text" || c.webkitBackgroundClip === "text") &&
					c.webkitTextFillColor === "rgba(0, 0, 0, 0)"
				);
			});
			const badges = [...document.querySelectorAll("body *")].filter(
				(e) =>
					e.children.length === 0 &&
					/^(new|nou|nouă)$/i.test((e.textContent || "").trim()) &&
					shown(e),
			);
			const credit = document.querySelectorAll("#recomex-credit");
			const c = credit[0];
			return {
				header: visible('header[role="banner"]').length,
				footer: visible("footer").length,
				hero: visible("main section:has(h1)").length,
				clip: clip.map((e) => e.textContent.trim().slice(0, 40)),
				badges: badges.map((e) => e.textContent.trim()),
				credits: credit.length,
				creditText: c ? c.textContent : "",
				creditHref: c ? c.href : "",
				creditTarget: c ? c.target : "",
				creditShown: c ? shown(c) : false,
				social: visible('a[href*="github.com"], a[href*="x.com/"], a[href*="twitter.com"]').filter(
					(e) => e.id !== "recomex-credit",
				).length,
				ground: getComputedStyle(document.body).backgroundColor,
				dark: document.documentElement.classList.contains("dark"),
				updates: (() => {
					try {
						return JSON.parse(localStorage.getItem("pdfcraft_update_settings") || "{}").autoCheck;
					} catch {
						return "unreadable";
					}
				})(),
			};
		});
		const at = `${path} (${theme})`;
		check(`B1 ${at} their header is not shown`, s.header === 0, `${s.header} visible`);
		check(`B2 ${at} their footer is not shown`, s.footer === 0, `${s.footer} visible`);
		check(`B3 ${at} their hero is not shown`, s.hero === 0, `${s.hero} visible`);
		check(`B4 ${at} no gradient text`, s.clip.length === 0, JSON.stringify(s.clip));
		check(`B5 ${at} no NEW / Nou badge`, s.badges.length === 0, JSON.stringify(s.badges));
		check(
			`B6 ${at} the credit, once, to the project, in a new tab`,
			s.credits === 1 &&
				s.creditShown &&
				s.creditText === "realizat cu PDFCraft" &&
				s.creditHref === "https://github.com/PDFCraftTool/pdfcraft" &&
				s.creditTarget === "_blank",
			JSON.stringify({
				n: s.credits,
				shown: s.creditShown,
				text: s.creditText,
				href: s.creditHref,
				target: s.creditTarget,
			}),
		);
		check(
			`B7 ${at} the estate's background`,
			s.dark === (theme === "dark") && s.ground === GROUND[theme],
			`${s.ground}, dark=${s.dark}`,
		);
		check(`B8 ${at} no GitHub/X link but the credit`, s.social === 0, `${s.social} visible`);
		check(
			`B9 ${at} the update check is off and never called`,
			s.updates === false && github.length === 0,
			`autoCheck=${s.updates}; calls=${github.join(" ")}`,
		);
		check(
			`B10 ${at} no console error, no page error, no failed request`,
			errors.length === 0,
			errors.join(" | "),
		);
		// The bar lives in a shadow root; read it from there.
		const barState = () =>
			page.evaluate(() => {
				const root = document.getElementById("recomex-bar")?.shadowRoot;
				if (!root) return null;
				const navs = [...root.querySelectorAll("nav")];
				return {
					sections: navs.map((n) => [...n.querySelectorAll("a")].map((a) => a.textContent)),
					current: navs.map((n) =>
						[...n.querySelectorAll('[aria-current="page"]')].map((a) => a.textContent),
					),
					account: root.querySelector('[data-slot="estate-account"]')?.textContent ?? "",
				};
			});
		await page
			.waitForFunction(
				() => document.getElementById("recomex-bar")?.shadowRoot?.querySelector("header"),
				null,
				{ timeout: 15000 },
			)
			.catch(() => undefined);
		await page.waitForTimeout(500);
		const bar = await barState();
		const want = SECTION[path];
		check(
			`B11 ${at} the bar, its four sections, ${want} current`,
			bar !== null &&
				bar.sections.length === 2 &&
				bar.sections.every((list) => JSON.stringify(list) === JSON.stringify(SECTIONS)) &&
				bar.current.every((list) => JSON.stringify(list) === JSON.stringify([want])),
			JSON.stringify(bar),
		);
		check(
			`B12 ${at} the bar's account is the person the gate passed`,
			bar?.account.includes(PERSON.name),
			JSON.stringify(bar?.account),
		);
		const english = await page.evaluate(englishShown, ENGLISH);
		check(
			`B14 ${at} no English tool name, description or message shown`,
			english.length === 0,
			JSON.stringify(english.slice(0, 8)),
		);
		if (path === "/ro/tools/") {
			await page.evaluate(() => window.history.pushState(null, "", "/ro/faq/"));
			await page.waitForTimeout(300);
			const moved = await barState();
			check(
				`B13 ${at} their router's navigation moves the current section`,
				moved?.current.every(
					(list) => JSON.stringify(list) === JSON.stringify(["Întrebări frecvente"]),
				),
				JSON.stringify(moved?.current),
			);
		}
		await page.close();
	}
	// The Studio and the workflow editor list every tool from a JS chunk.
	for (const path of ["/ro/studio/", "/ro/workflow/"]) {
		const page = await ctx.newPage();
		await page.goto(base + path, { waitUntil: "networkidle", timeout: 90000 });
		await page.waitForTimeout(1500);
		const english = await page.evaluate(englishShown, ENGLISH);
		check(
			`B14 ${path} (${theme}) no English tool name, description or message shown`,
			english.length === 0,
			JSON.stringify(english.slice(0, 8)),
		);
		await page.close();
	}
	{
		const page = await ctx.newPage();
		const errors = [];
		const payloads = [];
		page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 140)));
		page.on("pageerror", (e) => errors.push(`pageerror ${String(e).slice(0, 140)}`));
		page.on("request", (r) => r.url().includes(".txt") && payloads.push(r.url()));
		await page.goto(`${base}/ro/tools/`, { waitUntil: "networkidle", timeout: 90000 });
		await page.waitForTimeout(1000);
		await page.click(`main a[href="${CARD.href}"]`);
		await page.waitForURL(`**${CARD.href}`, { timeout: 30000 }).catch(() => undefined);
		await page.waitForTimeout(1500);
		const h1 = await page.evaluate(() => document.querySelector("h1")?.textContent?.trim() ?? "");
		check(
			`B15 /ro/tools/ (${theme}) a card click, by their router, lands on the tool in Romanian`,
			h1 === CARD.h1 && payloads.length > 0 && errors.length === 0,
			JSON.stringify({ h1, payloads: payloads.length, errors }),
		);
		await page.close();
	}
	await ctx.close();
}
await browser.close();
console.log(`\nbrowser.mjs: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
