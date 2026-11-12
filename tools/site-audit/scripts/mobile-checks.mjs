/**
 * The in-page half of the mobile audit: one function, serialised into the page by Playwright, that
 * measures the rendered layout and returns plain issue records. It runs after fonts are ready, with
 * reduced motion, so the layout it measures is the resting composition.
 *
 * Issue types: overflow, root-overflow-hidden, clipped-text, tap-target, tap-overlap, small-text,
 * long-lines, input-zoom, input-type, input-label, img-dimensions, viewport-meta, motion-reduce.
 */
export function pageChecks({ excluded, only }) {
	// The layout width. Under mobile emulation an overflowing page zooms out and innerWidth grows
	// to match the overflow, so innerWidth would hide exactly what this looks for.
	const vw = document.documentElement.clientWidth;
	const issues = [];
	const add = (type, el, detail) =>
		issues.push({
			type,
			sel: el ? describe(el) : "",
			detail,
			excluded: Boolean(excluded && el?.closest?.(excluded)),
		});

	function describe(el) {
		const parts = [];
		let node = el;
		for (let depth = 0; node && node.nodeType === 1 && depth < 3; depth++) {
			let part = node.tagName.toLowerCase();
			if (node.id) part += `#${node.id}`;
			const classes = [...node.classList].filter((c) => !c.includes(":")).slice(0, 3);
			if (classes.length) part += `.${classes.join(".")}`;
			parts.unshift(part);
			if (node.id) break;
			node = node.parentElement;
		}
		return parts.join(" > ");
	}

	function hidden(el) {
		// checkVisibility sees what getComputedStyle does not: the content of a closed <details>.
		if (
			el.checkVisibility &&
			!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
		)
			return true;
		const s = getComputedStyle(el);
		if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return true;
		const r = el.getBoundingClientRect();
		return r.width < 2 || r.height < 2;
	}

	function isFixed(el) {
		for (let n = el; n && n !== document.body; n = n.parentElement) {
			const p = getComputedStyle(n).position;
			if (p === "fixed" || p === "sticky") return p === "fixed";
		}
		return false;
	}

	/** The nearest ancestor (below body) that clips on the given axis, or null. */
	function clipper(el, axis) {
		for (
			let n = el.parentElement;
			n && n !== document.body && n !== document.documentElement;
			n = n.parentElement
		) {
			const o = getComputedStyle(n)[axis === "x" ? "overflowX" : "overflowY"];
			if (o !== "visible") return n;
		}
		return null;
	}

	const all = [...document.body.querySelectorAll("*")].filter(
		(el) => !["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "BR"].includes(el.tagName),
	);

	// The root must not hide overflow: that masks it instead of fixing it.
	for (const root of [document.documentElement, document.body]) {
		const o = getComputedStyle(root).overflowX;
		if (o === "hidden" || o === "clip") add("root-overflow-hidden", root, o);
	}

	// Horizontal overflow: elements whose box leaves the viewport, not inside a clipping ancestor.
	const overflowing = new Set();
	for (const el of all) {
		if (el.closest("[aria-hidden='true']") && el.closest(".pz-compass")) continue;
		const r = el.getBoundingClientRect();
		if (r.width === 0 || r.height === 0) continue;
		if (r.right <= vw + 1 && r.left >= -1) continue;
		const s = getComputedStyle(el);
		if (s.visibility === "hidden" || s.display === "contents") continue;
		if (el.checkVisibility && !el.checkVisibility()) continue;
		if (isFixed(el)) continue;
		if (clipper(el, "x")) continue;
		overflowing.add(el);
	}
	for (const el of overflowing) {
		// Report the outermost offender of each chain: its children follow it out.
		if (el.parentElement && overflowing.has(el.parentElement)) continue;
		const r = el.getBoundingClientRect();
		add("overflow", el, `left ${Math.round(r.left)} right ${Math.round(r.right)} of ${vw}`);
	}
	const sw = document.documentElement.scrollWidth;
	if (sw > vw || window.innerWidth > vw) {
		add(
			"overflow",
			document.documentElement,
			`scrollWidth ${sw}, innerWidth ${window.innerWidth} > ${vw}`,
		);
	}
	if (only === "overflow") return issues;

	// Clipped text: a run of text that a clipping ancestor cuts off.
	const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
	const clippedSeen = new Set();
	for (let t = walker.nextNode(); t; t = walker.nextNode()) {
		if (!t.textContent.trim()) continue;
		const host = t.parentElement;
		if (!host || clippedSeen.has(host) || hidden(host)) continue;
		if (host.closest("[aria-hidden='true'], .sr-only, .pz-sr, [hidden]")) continue;
		const hs = getComputedStyle(host);
		if (hs.textOverflow === "ellipsis" || hs.webkitLineClamp !== "none") continue;
		const range = document.createRange();
		range.selectNodeContents(t);
		const rects = [...range.getClientRects()];
		for (const axis of ["x", "y"]) {
			const c = clipper(host, axis);
			if (!c || isFixed(c)) continue;
			const cs = getComputedStyle(c);
			if (cs.textOverflow === "ellipsis" || cs.webkitLineClamp !== "none") continue;
			// A scroller clips by design; only a hidden/clip ancestor loses text for good.
			const o = axis === "x" ? cs.overflowX : cs.overflowY;
			if (o === "auto" || o === "scroll") continue;
			const cr = c.getBoundingClientRect();
			if (cr.width < 2 || cr.height < 2) continue;
			const cut = rects.some((r) =>
				axis === "x"
					? r.right > cr.right + 2 || r.left < cr.left - 2
					: r.bottom > cr.bottom + 2 || r.top < cr.top - 2,
			);
			if (cut) {
				clippedSeen.add(host);
				add(
					"clipped-text",
					host,
					`${axis} by ${describe(c)}: "${t.textContent.trim().slice(0, 40)}"`,
				);
				break;
			}
		}
	}

	// Tap targets: 44×44 at least, except links inside running text.
	const targets = [
		...document.querySelectorAll(
			"a[href], button, input:not([type='hidden']), select, textarea, summary, [role='button'], [role='tab'], [role='switch']",
		),
	].filter((el) => !hidden(el) && !el.closest("[inert], [aria-hidden='true']"));
	const boxes = [];
	for (const el of targets) {
		let box = el;
		if (el.matches("input[type='checkbox'], input[type='radio']")) {
			box =
				el.closest("label") ??
				(el.id ? document.querySelector(`label[for="${el.id}"]`) : null) ??
				el;
		}
		const r = box.getBoundingClientRect();
		const s = getComputedStyle(el);
		const inline = el.tagName === "A" && s.display === "inline";
		if (inline) {
			const block = el.closest("p, li, dd, td, blockquote, figcaption, small, span");
			const own = el.textContent.trim().length;
			if (block && block.textContent.trim().length > own + 8) continue;
		}
		boxes.push({ el, r, fixed: isFixed(el) });
		if (r.width < 43.5 || r.height < 43.5) {
			add("tap-target", el, `${Math.round(r.width)}×${Math.round(r.height)}`);
		}
	}
	for (let i = 0; i < boxes.length; i++) {
		for (let j = i + 1; j < boxes.length; j++) {
			const a = boxes[i];
			const b = boxes[j];
			if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
			// The fixed Compass floats over the page by design; compassAtFoot checks what it covers.
			if (a.fixed || b.fixed) continue;
			const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
			const iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
			if (ix > 2 && iy > 2) add("tap-overlap", a.el, `with ${describe(b.el)}`);
		}
	}

	// Body text: running text at 16px or more, with a comfortable measure.
	for (const el of document.querySelectorAll(
		"main p, main li, main dd, main td, main blockquote",
	)) {
		if (hidden(el) || el.closest("footer, nav, .pz-compass, small, figcaption")) continue;
		const own = [...el.childNodes]
			.filter((n) => n.nodeType === 3)
			.map((n) => n.textContent)
			.join("")
			.trim();
		if (own.length < 60) continue;
		const s = getComputedStyle(el);
		const fs = Number.parseFloat(s.fontSize);
		if (fs < 15.5) add("small-text", el, `${fs}px`);
		const cpl = el.getBoundingClientRect().width / (fs * 0.5);
		if (cpl > 95) add("long-lines", el, `~${Math.round(cpl)} chars/line`);
	}

	// Forms: no zoom on focus, the right keyboard, a visible label.
	for (const el of document.querySelectorAll("input:not([type='hidden']), select, textarea")) {
		if (hidden(el) && !el.matches("[type='checkbox'], [type='radio']")) continue;
		const s = getComputedStyle(el);
		const type =
			el.getAttribute("type") ?? (el.tagName === "INPUT" ? "text" : el.tagName.toLowerCase());
		if (
			!["checkbox", "radio", "range", "submit", "button"].includes(type) &&
			Number.parseFloat(s.fontSize) < 16
		) {
			add("input-zoom", el, `${s.fontSize}`);
		}
		const key = `${el.name} ${el.id} ${el.getAttribute("autocomplete") ?? ""}`.toLowerCase();
		if (/e-?mail/.test(key) && type !== "email")
			add("input-type", el, `email field is type=${type}`);
		if (/(phone|tel|telefon)/.test(key) && type !== "tel")
			add("input-type", el, `phone field is type=${type}`);
		if (
			/(e-?mail|phone|tel|telefon|^name|nume|full.?name)/.test(key) &&
			!el.getAttribute("autocomplete")
		) {
			add("input-type", el, "no autocomplete");
		}
		const labelled = el.labels?.length || el.getAttribute("aria-labelledby");
		if (!labelled && !el.getAttribute("aria-label") && !el.getAttribute("title"))
			add("input-label", el, "no label");
		else if (!labelled && el.closest("main") && !el.closest("search, [role='search']")) {
			// A lone field in a search landmark keeps its placeholder and its button as the label.
			add("input-label", el, "label not visible");
		}
	}

	// Images: intrinsic dimensions or an aspect ratio, so they do not shift the page as they load.
	for (const img of document.querySelectorAll("img")) {
		if (hidden(img)) continue;
		const s = getComputedStyle(img);
		const sized =
			(img.getAttribute("width") && img.getAttribute("height")) || s.aspectRatio !== "auto";
		if (!sized) add("img-dimensions", img, img.getAttribute("src")?.slice(0, 60) ?? "");
	}

	const meta = document.querySelector("meta[name='viewport']")?.getAttribute("content") ?? "";
	if (!/width=device-width/.test(meta) || /user-scalable=no|maximum-scale=1(\D|$)/.test(meta)) {
		add("viewport-meta", null, meta || "missing");
	}

	// Reduced motion: nothing keeps moving once a visitor asked for less motion.
	for (const a of document.getAnimations()) {
		if (a.playState !== "running") continue;
		const timing = a.effect?.getComputedTiming?.() ?? {};
		const target = a.effect?.target;
		if (target && target.nodeType === 1 && hidden(target)) continue;
		if (Number(timing.duration) < 50 && timing.iterations !== Number.POSITIVE_INFINITY) continue;
		// A colour or fade transition is not motion; only movement counts against the preference.
		if (
			a.transitionProperty &&
			!/transform|translate|rotate|scale|top|left|right|bottom|inset|margin|width|height/.test(
				a.transitionProperty,
			)
		) {
			continue;
		}
		add(
			"motion-reduce",
			target?.nodeType === 1 ? target : null,
			a.animationName ?? a.transitionProperty ?? "animation",
		);
	}
	if (getComputedStyle(document.documentElement).scrollBehavior === "smooth") {
		add("motion-reduce", document.documentElement, "scroll-behavior: smooth");
	}

	return issues;
}

/** The Compass at full scroll: the last action clears the bar, the page leaves room, the sheet fits and scrolls. */
export function compassAtFoot() {
	const issues = [];
	const bar = document.querySelector(".pz-compass__bar");
	if (!bar) return issues;
	const br = bar.getBoundingClientRect();
	const vh = window.innerHeight;
	const candidates = [
		...document.querySelectorAll(
			"main a[href], main button, footer a[href], footer button, main p, footer p",
		),
	]
		.filter((el) => !el.closest(".pz-compass"))
		.filter((el) => {
			const r = el.getBoundingClientRect();
			const s = getComputedStyle(el);
			return (
				r.width > 1 &&
				r.height > 1 &&
				s.visibility !== "hidden" &&
				s.display !== "none" &&
				r.top < vh
			);
		});
	const covered = candidates.filter((el) => {
		const r = el.getBoundingClientRect();
		return r.bottom > br.top + 1 && r.top < br.bottom && r.right > br.left && r.left < br.right;
	});
	for (const el of covered.slice(-3)) {
		const r = el.getBoundingClientRect();
		issues.push({
			type: "compass-covers",
			sel: `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).trim().split(/\s+/).slice(0, 2).join(".")}` : ""}`,
			detail: `bottom ${Math.round(r.bottom)} under bar top ${Math.round(br.top)}`,
		});
	}
	return issues;
}

/** At first paint: a primary action inside the first screen that the floating bar sits on. */
export function compassAtLoad() {
	const bar = document.querySelector(".pz-compass__bar");
	if (!bar) return [];
	const br = bar.getBoundingClientRect();
	const issues = [];
	for (const el of document.querySelectorAll(".pz-btn--primary")) {
		if (el.closest(".pz-compass")) continue;
		const r = el.getBoundingClientRect();
		// Only an action the first screen fully shows: one straddling the fold is below-the-fold content.
		if (r.width < 2 || r.bottom > window.innerHeight) continue;
		if (r.bottom > br.top && r.top < br.bottom && r.right > br.left && r.left < br.right) {
			const cls = [...el.classList].slice(0, 3).join(".");
			issues.push({
				type: "compass-at-load",
				info: true,
				sel: `${el.parentElement?.className.split(" ")[0] ?? ""} > a.${cls}`,
				detail: "primary action under the bar at first paint (one scroll frees it)",
			});
		}
	}
	return issues;
}

/** The opened sheet: null when it did not open. */
export function compassSheet() {
	const sheet = document.querySelector(".pz-compass__sheet");
	const bar = document.querySelector(".pz-compass__bar");
	if (!sheet || !bar) return [];
	if (getComputedStyle(sheet).display === "none") return null;
	const issues = [];
	const sr = sheet.getBoundingClientRect();
	const br = bar.getBoundingClientRect();
	const vw = document.documentElement.clientWidth;
	for (const [name, r] of [
		["sheet", sr],
		["bar", br],
	]) {
		if (r.left < -1 || r.right > vw + 1) {
			issues.push({
				type: "compass-sheet",
				sel: `.pz-compass__${name}`,
				detail: `left ${Math.round(r.left)} right ${Math.round(r.right)} of ${vw}`,
			});
		}
	}
	if (sr.top < 0)
		issues.push({
			type: "compass-sheet",
			sel: ".pz-compass__sheet",
			detail: `top ${Math.round(sr.top)} off screen`,
		});
	if (sr.bottom > br.top + 1)
		issues.push({ type: "compass-sheet", sel: ".pz-compass__sheet", detail: "overlaps the bar" });
	const s = getComputedStyle(sheet);
	if (sheet.scrollHeight > sheet.clientHeight + 1 && !["auto", "scroll"].includes(s.overflowY)) {
		issues.push({
			type: "compass-sheet",
			sel: ".pz-compass__sheet",
			detail: "content taller than sheet, no scroll",
		});
	}
	if (s.overscrollBehaviorY !== "contain") {
		issues.push({
			type: "compass-sheet",
			sel: ".pz-compass__sheet",
			detail: "scroll chains to the page (overscroll-behavior)",
		});
	}
	return issues;
}
