#!/usr/bin/env node
/**
 * Mobile audit of the running psi sites: every route of every sitemap, at phone and tablet widths,
 * in light and dark, emulated as a touch phone. Reports overflowing elements by selector, clipped
 * text, small tap targets, small body text, form fields, image sizing, reduced motion, layout shift
 * and the Compass bar, so the check repeats instead of being eyeballed.
 *
 *   node scripts/mobile-audit.mjs [--site psizone,eqsync] [--widths 320,390] [--themes light,dark]
 *        [--route /contact] [--json out.json] [--shots dir --shot-width 390 --shot-urls a,b]
 *
 * Exit code 1 when an actionable (not excluded) issue remains.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { compassAtFoot, compassAtLoad, compassSheet, pageChecks } from "./mobile-checks.mjs";

/**
 * Areas other owners are changing (their files are off-limits to this pass): issues there are
 * counted apart, and their fix is handed to the owner. `exclude` is a selector for the rendered
 * output of those files; `excludeRoutes` are whole pages they own.
 *   psizone  sections/header.tsx (the top <header>), hero.tsx (.hero), hubs.tsx (#pentru-cine),
 *            closing.tsx (#programare and the footer's own nav), booking.tsx + the contact page,
 *            the account page
 *   eqsync   sections/header.tsx (the top <header>), the account pages (signup/register, /cont)
 *   hemisync the account page (/cont)
 *   gallery  server.tsx (the page shell's sticky <header>)
 *   blog     apps/blog-web/src/** (every page)
 */
/** The accounts agent's page, on every site that has one. */
const ACCOUNT = /^(\/en)?\/cont(\/.*)?$/;
const SITES = {
	gallery: {
		port: 4300,
		brand: null,
		routes: ["/", "/en"],
		exclude: "body > header",
		excludeRoutes: [],
	},
	psizone: {
		port: 4310,
		brand: "psizone",
		exclude: `header:not(main header), .hero, #pentru-cine, #programare, footer nav[aria-label="Footer"]`,
		excludeRoutes: [/^(\/en)?\/contact$/, ACCOUNT],
	},
	eqsync: {
		port: 4320,
		brand: "eqsync",
		exclude: "header:not(main header)",
		excludeRoutes: [/^(\/en)?\/(inregistrare|sign-up)$/, ACCOUNT],
	},
	// hemisync's sections/header.tsx renders only the skip link and the shared Compass; its visible
	// header is part of hero.tsx and page shells, which this pass may change.
	hemisync: { port: 4330, brand: "hemisync", exclude: "", excludeRoutes: [ACCOUNT] },
	blog: { port: 4340, brand: "blog", exclude: "*", excludeRoutes: [/.*/] },
};

function arg(name, fallback) {
	const i = process.argv.indexOf(`--${name}`);
	return i > -1 ? process.argv[i + 1] : fallback;
}
const sites = arg("site", Object.keys(SITES).join(",")).split(",");
const widths = arg("widths", "320,360,390,414,768").split(",").map(Number);
const themes = arg("themes", "light,dark").split(",");
const onlyRoute = arg("route", null);
const jsonOut = arg("json", null);
const shotsDir = arg("shots", null);
const concurrency = Number(arg("concurrency", "6"));
const motionWidths = arg("motion-widths", "320,390").split(",").map(Number);
const focusWidth = Number(arg("focus-width", "390"));

async function fetchRetry(url, tries = 5) {
	for (let i = 0; i < tries; i++) {
		try {
			const res = await fetch(url);
			if (res.ok) return res;
		} catch {}
		await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
	}
	return null;
}

async function routesOf(name) {
	const site = SITES[name];
	if (site.routes) return site.routes;
	const res = await fetchRetry(`http://localhost:${site.port}/sitemap.xml`);
	if (!res) throw new Error(`${name}: sitemap unreachable`);
	const xml = await res.text();
	return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
}

const CLS_PROBE = `
	window.__cls = 0;
	window.__clsNodes = [];
	new PerformanceObserver((list) => {
		for (const e of list.getEntries()) {
			if (e.hadRecentInput) continue;
			window.__cls += e.value;
			for (const s of e.sources ?? []) {
				const n = s.node?.nodeType === 1 ? s.node : s.node?.parentElement;
				if (n) window.__clsNodes.push(n);
			}
		}
	}).observe({ type: "layout-shift", buffered: true });
`;

/** Total shift, the elements that moved, and whether every one of them is in an excluded area. */
function clsReport(excluded) {
	const nodes = [...new Set(window.__clsNodes)].filter((n) => n.isConnected);
	const name = (n) =>
		`${n.tagName.toLowerCase()}${n.classList.length ? `.${[...n.classList].slice(0, 2).join(".")}` : ""}`;
	return {
		cls: window.__cls,
		sel: nodes.slice(0, 3).map(name).join(", "),
		excluded: Boolean(excluded) && nodes.length > 0 && nodes.every((n) => n.closest(excluded)),
	};
}

/**
 * Focus: Tab through the first stops of the page and compare each one focused and blurred. A stop
 * that looks the same both ways has no visible focus state.
 */
async function focusProbe(page, excluded) {
	const issues = [];
	await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important}" });
	await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
	const seen = new Set();
	for (let i = 0; i < 24; i++) {
		await page.keyboard.press("Tab");
		const r = await page.evaluate((ex) => {
			const el = document.activeElement;
			if (!el || el === document.body) return null;
			const look = () => {
				const s = getComputedStyle(el);
				const after = getComputedStyle(el, "::after");
				const before = getComputedStyle(el, "::before");
				return [
					s.outlineStyle,
					s.outlineWidth,
					s.outlineColor,
					s.boxShadow,
					s.backgroundColor,
					s.borderColor,
					s.textDecorationLine,
					s.color,
					after.boxShadow,
					after.outlineStyle,
					before.boxShadow,
					before.outlineStyle,
				].join("|");
			};
			const parentLook = () => {
				const p = el.closest(".pz-compass__bar, .pz-ask__bar, label");
				if (!p || p === el) return "";
				const s = getComputedStyle(p);
				return [s.boxShadow, s.outlineStyle, s.borderColor].join("|");
			};
			const on = look() + parentLook();
			const parts = [];
			for (let n = el; n && n.nodeType === 1 && parts.length < 3; n = n.parentElement) {
				parts.unshift(
					n.tagName.toLowerCase() +
						(n.id ? `#${n.id}` : "") +
						(n.classList.length
							? `.${[...n.classList]
									.filter((c) => !c.includes(":"))
									.slice(0, 3)
									.join(".")}`
							: ""),
				);
			}
			const sel = parts.join(" > ");
			el.blur();
			const off = look() + parentLook();
			el.focus({ focusVisible: true });
			return { sel, same: on === off, excluded: Boolean(ex && el.closest(ex)) };
		}, excluded);
		if (!r || seen.has(r.sel)) continue;
		seen.add(r.sel);
		if (r.same)
			issues.push({
				type: "focus-invisible",
				sel: r.sel,
				detail: "no visible change on focus",
				excluded: r.excluded,
			});
	}
	return issues;
}

async function auditPage(browser, job) {
	const { name, route, width, theme } = job;
	const site = SITES[name];
	const context = await browser.newContext({
		viewport: { width, height: width >= 768 ? 1024 : 800 },
		isMobile: true,
		hasTouch: true,
		deviceScaleFactor: 2,
		reducedMotion: "reduce",
	});
	if (site.brand) {
		await context.addCookies([
			{ name: "theme", value: `${site.brand}-${theme}`, url: `http://localhost:${site.port}` },
		]);
	}
	await context.addInitScript(CLS_PROBE);
	const page = await context.newPage();
	const url = `http://localhost:${site.port}${route}`;
	const out = { ...job, status: 0, issues: [] };
	try {
		let res = null;
		for (let i = 0; i < 4 && !res; i++) {
			res = await page.goto(url, { waitUntil: "load", timeout: 30000 }).catch(() => null);
			if (!res) await page.waitForTimeout(1500 * (i + 1));
		}
		out.status = res?.status() ?? 0;
		if (!res) return out;
		await page.evaluate(() => document.fonts.ready);
		await page.waitForTimeout(400);
		const excluded = site.excludeRoutes.some((r) => r.test(route)) ? "*" : site.exclude;
		if (site.brand) {
			const applied = await page.evaluate(() => document.documentElement.dataset.theme ?? "");
			if (applied !== `${site.brand}-${theme}`) {
				out.issues.push({
					type: "theme",
					sel: "html",
					detail: `asked ${site.brand}-${theme}, got ${applied}`,
				});
			}
		}
		out.issues.push(...(await page.evaluate(pageChecks, { excluded })));
		// At first paint, a primary action under the floating Compass. Informational: where a hero
		// runs past the fold, which width puts its action in the bar's band is coincidence, and one
		// scroll frees it. What a visitor can never scroll free is compassAtFoot's job.
		out.issues.push(...(await page.evaluate(compassAtLoad)));
		const shift = await page.evaluate(clsReport, excluded);
		if (shift.cls > 0.05) {
			out.issues.push({
				type: "layout-shift",
				sel: shift.sel,
				detail: `CLS ${shift.cls.toFixed(3)}`,
				excluded: shift.excluded,
			});
		}
		if (shotsDir && width === Number(arg("shot-width", "390")) && theme === themes[0]) {
			const shotUrls = (arg("shot-urls", "") || "").split(",").filter(Boolean);
			if (shotUrls.includes("all") || shotUrls.includes(`${name}${route}`)) {
				mkdirSync(shotsDir, { recursive: true });
				const file = `${name}${route.replaceAll("/", "_") || "_"}-${width}.png`;
				await page.screenshot({ path: join(shotsDir, file), fullPage: true });
			}
		}
		if (width === focusWidth && theme === themes[0])
			out.issues.push(...(await focusProbe(page, excluded)));
		// Motion: scroll-driven effects run only without the reduced-motion preference, and they can
		// push boxes sideways mid-scroll. Scroll the page a screen at a time and measure again.
		if (motionWidths.includes(width) && theme === themes[0]) {
			await page.emulateMedia({ reducedMotion: "no-preference" });
			const height = await page.evaluate(() => document.documentElement.scrollHeight);
			const seen = new Set(out.issues.filter((i) => i.type === "overflow").map((i) => i.sel));
			for (let y = 0; y < height; y += 700) {
				await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
				await page.waitForTimeout(120);
				for (const i of await page.evaluate(pageChecks, { excluded, only: "overflow" })) {
					if (seen.has(i.sel)) continue;
					seen.add(i.sel);
					out.issues.push({ ...i, type: "overflow-motion" });
				}
			}
			await page.emulateMedia({ reducedMotion: "reduce" });
		}
		// The Compass: at full scroll nothing is under the bar; opened, its sheet fits and scrolls.
		await page.evaluate(() =>
			window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }),
		);
		await page.waitForTimeout(150);
		out.issues.push(...(await page.evaluate(compassAtFoot)));
		const orb = await page.$(".pz-compass__orb");
		if (orb && (await orb.isVisible())) {
			// The focus probe may already have opened it (focusing the field opens the sheet); a tap
			// then would close it. A zoomed-out (overflowing) page can defeat a real tap: click instead.
			let sheet = await page.evaluate(compassSheet);
			let tapped = "";
			if (sheet === null) {
				tapped = await orb.tap({ timeout: 3000 }).then(
					() => "",
					async (e) => {
						await orb.dispatchEvent("click");
						return `(tap failed: ${String(e).split("\n")[0].slice(0, 80)})`;
					},
				);
				await page.waitForTimeout(250);
				sheet = await page.evaluate(compassSheet);
			}
			if (tapped && sheet !== null)
				out.issues.push({ type: "compass-sheet", sel: ".pz-compass__orb", detail: tapped });
			if (sheet === null) {
				out.issues.push({
					type: "compass-sheet",
					sel: ".pz-compass__orb",
					detail: `sheet did not open ${tapped}`,
				});
			} else out.issues.push(...sheet);
		}
		const isExcludedRoute = site.excludeRoutes.some((r) => r.test(route));
		for (const i of out.issues) if (isExcludedRoute) i.excluded = true;
	} catch (e) {
		out.error = String(e).slice(0, 200);
	} finally {
		await context.close();
	}
	return out;
}

async function main() {
	const browser = await chromium.launch({
		executablePath: "/usr/bin/google-chrome",
		headless: true,
	});
	const jobs = [];
	for (const name of sites) {
		const routes = (await routesOf(name)).filter((r) => !onlyRoute || r === onlyRoute);
		const siteThemes = SITES[name].brand ? themes : [themes[0]];
		for (const route of routes)
			for (const width of widths)
				for (const theme of siteThemes) jobs.push({ name, route, width, theme });
	}
	const results = [];
	let next = 0;
	await Promise.all(
		Array.from({ length: concurrency }, async () => {
			while (next < jobs.length) {
				const job = jobs[next++];
				results.push(await auditPage(browser, job));
				if (results.length % 50 === 0) process.stderr.write(`  ${results.length}/${jobs.length}\n`);
			}
		}),
	);
	await browser.close();

	// Collapse: one line per site, route, type and selector, with the widths and themes it shows at.
	const lines = new Map();
	const summary = {};
	for (const r of results) {
		summary[r.name] ??= {
			pages: 0,
			unreachable: 0,
			actionable: 0,
			excluded: 0,
			info: 0,
			byType: {},
		};
		const s = summary[r.name];
		s.pages++;
		if (r.status !== 200) s.unreachable++;
		for (const i of r.issues) {
			const key = `${r.name}|${r.route}|${i.type}|${i.sel}|${Boolean(i.excluded)}`;
			const line = lines.get(key) ?? {
				site: r.name,
				route: r.route,
				...i,
				widths: new Set(),
				themes: new Set(),
				count: 0,
			};
			line.widths.add(r.width);
			line.themes.add(r.theme);
			line.count++;
			lines.set(key, line);
		}
	}
	for (const l of lines.values()) {
		const s = summary[l.site];
		const bucket = l.info ? "info" : l.excluded ? "excluded" : "actionable";
		s[bucket] = (s[bucket] ?? 0) + 1;
		if (bucket === "actionable") s.byType[l.type] = (s.byType[l.type] ?? 0) + 1;
	}
	const rows = [...lines.values()].map((l) => ({
		...l,
		widths: [...l.widths].sort((a, b) => a - b),
		themes: [...l.themes],
	}));
	for (const l of rows.filter((x) => !x.excluded)) {
		const tag = l.info ? "info " : "";
		console.log(
			`${tag}${l.site} ${l.route} [${l.widths.join(",")}|${l.themes.join(",")}] ${l.type} ${l.sel} — ${l.detail}`,
		);
	}
	console.log("\nper site (issue lines, deduplicated by route+type+selector):");
	for (const [name, s] of Object.entries(summary)) {
		console.log(
			`  ${name.padEnd(9)} pages ${String(s.pages).padStart(4)}  unreachable ${s.unreachable}  actionable ${s.actionable}  excluded ${s.excluded}  info ${s.info}  ${JSON.stringify(s.byType)}`,
		);
	}
	const errors = results.filter((r) => r.error);
	for (const e of errors) console.log(`error ${e.name}${e.route} ${e.width}: ${e.error}`);
	if (jsonOut)
		writeFileSync(
			jsonOut,
			JSON.stringify(
				{ summary, rows, unreachable: results.filter((r) => r.status !== 200) },
				null,
				2,
			),
		);
	process.exitCode = Object.values(summary).some((s) => s.actionable || s.unreachable) ? 1 : 0;
}

await main();
