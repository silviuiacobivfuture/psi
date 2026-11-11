/* @ds-bundle: {"format":4,"namespace":"Psizone","components":[{"name":"Logo"},{"name":"AmbientField"},{"name":"Button"},{"name":"GlassCard"},{"name":"Chip"},{"name":"StatusBadge"},{"name":"TextField"},{"name":"AskBar"},{"name":"GuideMessage"},{"name":"HubCard"},{"name":"ProgressSignal"},{"name":"NavBar"},{"name":"PractitionerCard"},{"name":"ArticleCard"},{"name":"Prose"},{"name":"AudioPlayer"},{"name":"ProgramTracker"},{"name":"ProductCard"}]} */
(() => {
	var React = window.React,
		h = React.createElement;
	var uid = 0;
	function cx() {
		return Array.prototype.filter.call(arguments, Boolean).join(" ");
	}
	function omit(o, keys) {
		var r = {};
		for (var k in o) if (keys.indexOf(k) < 0) r[k] = o[k];
		return r;
	}
	function Arrow(p) {
		return h(
			"svg",
			{
				width: p.size || 18,
				height: p.size || 18,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 2,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": true,
				className: p.className,
			},
			h("path", { d: "M5 12h14" }),
			h("path", { d: "M13 6l6 6-6 6" }),
		);
	}

	function Mark(props) {
		var id = React.useMemo(() => {
			uid += 1;
			return "pz-mark-" + uid;
		}, []);
		var s = props.size || 32;
		return h(
			"svg",
			{
				width: s,
				height: s,
				viewBox: "0 0 64 64",
				"aria-hidden": props.decorative ? true : undefined,
				role: props.decorative ? undefined : "img",
				"aria-label": props.decorative ? undefined : "Psizone",
			},
			h(
				"defs",
				null,
				h(
					"radialGradient",
					{ id: id, cx: "28%", cy: "22%", r: "90%" },
					h("stop", { offset: "0", stopColor: "var(--glow-3)" }),
					h("stop", { offset: ".48", stopColor: "var(--glow-2)" }),
					h("stop", { offset: "1", stopColor: "var(--glow-1)" }),
				),
			),
			h("circle", { cx: 32, cy: 32, r: 30, fill: "url(#" + id + ")" }),
		);
	}

	function Logo(props) {
		var size = props.size || 32,
			brand = props.brand || "auto",
			word = props.variant !== "mark";
		var fs = Math.round(size * 0.78) + "px";
		return h(
			props.href ? "a" : "span",
			{ className: cx("pz-logo", "pz-logo--" + brand, props.className), href: props.href },
			h(
				"span",
				{ className: "pz-logo__brand pz-logo__brand--psizone", "aria-label": "Psizone" },
				h(Mark, { size: size, decorative: true }),
				word ? h("span", { className: "pz-logo__word", style: { fontSize: fs } }, "psizone") : null,
			),
			h(
				"span",
				{
					className: "pz-logo__brand pz-logo__brand--eqsync",
					"aria-label": "EQ-SYNC",
					style: { fontSize: Math.round(size * 0.6) + "px" },
				},
				h("span", { className: "pz-logo__eq" }, "EQ-SYNC", h("b", null, ".")),
			),
			h(
				"span",
				{
					className: "pz-logo__brand pz-logo__brand--hemisync",
					"aria-label": "Hemi-Sync România",
					style: { fontSize: Math.round(size * 0.6) + "px" },
				},
				h("span", { className: "pz-logo__hs" }, "Hemi-Sync", h("small", null, "România")),
			),
		);
	}

	function AmbientField(props) {
		var W = 1200,
			Hh = 400,
			i,
			d1 = "M0 200",
			d2 = "M0 230",
			x;
		for (i = 0; i <= 60; i++) {
			x = (i * W) / 60;
			d1 +=
				" L" + x.toFixed(0) + " " + (200 + Math.sin(i / 3.2) * 60 * Math.sin(i / 19)).toFixed(1);
			d2 +=
				" L" +
				x.toFixed(0) +
				" " +
				(230 + Math.sin(i / 2.4 + 1) * 40 * Math.cos(i / 23)).toFixed(1);
		}
		return h(
			"div",
			{
				className: cx(
					"pz-ambient",
					props.intensity && props.intensity !== "medium" ? "pz-ambient--" + props.intensity : null,
					props.className,
				),
				style: props.style,
			},
			h("span", { className: "pz-ambient__blob pz-ambient__blob--1", "aria-hidden": true }),
			h("span", { className: "pz-ambient__blob pz-ambient__blob--2", "aria-hidden": true }),
			h("span", { className: "pz-ambient__blob pz-ambient__blob--3", "aria-hidden": true }),
			h(
				"svg",
				{
					className: "pz-ambient__waves",
					viewBox: "0 0 " + W + " " + Hh,
					preserveAspectRatio: "none",
					"aria-hidden": true,
				},
				h("path", { d: d1 }),
				h("path", { d: d2 }),
			),
			h("div", { className: "pz-ambient__content" }, props.children),
		);
	}

	function Button(props) {
		var variant = props.variant || "primary",
			size = props.size || "md";
		var rest = omit(props, ["variant", "size", "arrow", "className", "children", "href"]);
		rest.className = cx(
			"pz-btn",
			"pz-btn--" + variant,
			size !== "md" ? "pz-btn--" + size : null,
			props.className,
		);
		if (props.href) rest.href = props.href;
		return h(
			props.href ? "a" : "button",
			rest,
			props.children,
			props.arrow ? h(Arrow, { className: "pz-btn__arrow" }) : null,
		);
	}

	function GlassCard(props) {
		var rest = omit(props, ["solid", "className", "children", "as"]);
		rest.className = cx("pz-glass", props.solid ? "pz-glass--solid" : null, props.className);
		return h(props.as || "div", rest, props.children);
	}

	function Chip(props) {
		var tone = props.tone || "neutral";
		if (props.onClick || props.selected !== undefined) {
			return h(
				"button",
				{
					type: "button",
					className: cx("pz-chip", props.className),
					"aria-pressed": props.selected ? "true" : "false",
					onClick: props.onClick,
				},
				props.children,
			);
		}
		return h(
			"span",
			{ className: cx("pz-chip", "pz-chip--static", "pz-chip--" + tone, props.className) },
			props.children,
		);
	}

	function StatusBadge(props) {
		var tone = props.tone || "neutral";
		return h(
			"span",
			{ className: cx("pz-status", "pz-status--" + tone, props.className) },
			h("span", { className: "pz-status__dot", "aria-hidden": true }),
			h("span", { style: { color: "var(--ink)" } }, props.children),
		);
	}

	function TextField(props) {
		var id = React.useMemo(() => {
			uid += 1;
			return props.id || "pz-field-" + uid;
		}, [props.id]);
		var rest = omit(props, ["label", "hint", "error", "className", "id"]);
		rest.id = id;
		rest.className = "pz-input";
		if (props.hint || props.error) rest["aria-describedby"] = id + "-hint";
		if (props.error) rest["aria-invalid"] = true;
		return h(
			"div",
			{ className: cx("pz-field", props.error ? "pz-field--error" : null, props.className) },
			props.label ? h("label", { className: "pz-field__label", htmlFor: id }, props.label) : null,
			h("input", rest),
			props.error || props.hint
				? h(
						"span",
						{ className: "pz-field__hint", id: id + "-hint" },
						props.error ? "Eroare: " + props.error : props.hint,
					)
				: null,
		);
	}

	function AskBar(props) {
		var st = React.useState(props.defaultValue || ""),
			value = st[0],
			setValue = st[1];
		function submit(e) {
			e.preventDefault();
			if (props.onSubmit && value.trim()) props.onSubmit(value.trim());
		}
		return h(
			"form",
			{ className: cx("pz-ask", props.className), onSubmit: submit, role: "search" },
			h(
				"div",
				{ className: "pz-ask__bar" },
				h("span", { className: "pz-ask__orb", "aria-hidden": true }),
				h("input", {
					className: "pz-ask__input",
					value: value,
					onChange: (e) => {
						setValue(e.target.value);
					},
					placeholder: props.placeholder || "Întreabă-ne orice…",
					"aria-label": props.label || "Întreabă ghidul Psizone",
				}),
				h(
					"button",
					{ type: "submit", className: "pz-ask__send", "aria-label": "Trimite" },
					h(Arrow, { size: 20 }),
				),
			),
			props.suggestions && props.suggestions.length
				? h(
						"div",
						{ className: "pz-ask__chips" },
						props.suggestions.map((s) =>
							h(
								Chip,
								{
									key: s,
									selected: false,
									onClick: () => {
										setValue(s);
										if (props.onSubmit) props.onSubmit(s);
									},
								},
								s,
							),
						),
					)
				: null,
		);
	}

	function GuideMessage(props) {
		var role = props.role || "guide";
		return h(
			"div",
			{ className: cx("pz-msg", "pz-msg--" + role, props.className) },
			role === "guide" ? h("span", { className: "pz-msg__avatar", "aria-hidden": true }) : null,
			h(
				"div",
				{ className: "pz-msg__bubble" },
				props.children,
				props.sources && props.sources.length
					? h(
							"div",
							{ className: "pz-msg__sources" },
							props.sources.map((s) =>
								h("a", { key: s.label, className: "pz-msg__source", href: s.href || "#" }, s.label),
							),
						)
					: null,
			),
		);
	}

	function HubCard(props) {
		return h(
			"a",
			{ className: cx("pz-hub", props.className), href: props.href || "#" },
			h("span", {
				className: "pz-hub__glow pz-hub__glow--" + (props.hue || 1),
				"aria-hidden": true,
			}),
			props.eyebrow ? h("span", { className: "pz-hub__eyebrow" }, props.eyebrow) : null,
			h("h3", { className: "pz-hub__title" }, props.title),
			props.text ? h("p", { className: "pz-hub__text" }, props.text) : null,
			h(
				"div",
				{ className: "pz-hub__foot" },
				h(
					"div",
					{ style: { display: "flex", flexWrap: "wrap", gap: "6px" } },
					(props.tags || []).map((t) => h(Chip, { key: t, tone: "accent" }, t)),
				),
				h("span", { className: "pz-hub__arrow", "aria-hidden": true }, h(Arrow, null)),
			),
		);
	}

	function wave(n, w, ht, from, to) {
		var pts = [],
			i,
			t,
			amp,
			y;
		for (i = 0; i <= n; i++) {
			t = i / n;
			amp = ((from + (to - from) * t) * ht) / 2;
			y = ht / 2 + Math.sin(i * 1.7) * amp * (0.6 + 0.4 * Math.sin(i * 0.53 + 1));
			pts.push((t * w).toFixed(1) + "," + y.toFixed(1));
		}
		return "M" + pts.join(" L");
	}
	function ProgressSignal(props) {
		var w = 520,
			ht = 120,
			d = wave(
				64,
				w,
				ht,
				props.startNoise == null ? 0.9 : props.startNoise,
				props.endNoise == null ? 0.18 : props.endNoise,
			);
		return h(
			"figure",
			{ className: cx("pz-signal", props.className), style: { margin: 0 } },
			h(
				"div",
				{ className: "pz-signal__head" },
				h("span", { className: "pz-signal__label" }, props.label || "Progres"),
				props.delta ? h("span", { className: "pz-signal__delta" }, props.delta) : null,
			),
			h(
				"svg",
				{
					viewBox: "0 0 " + w + " " + ht,
					role: "img",
					"aria-label": (props.label || "Progres") + (props.delta ? ": " + props.delta : ""),
				},
				h("line", { className: "pz-signal__base", x1: 0, x2: w, y1: ht / 2, y2: ht / 2 }),
				h("path", { className: "pz-signal__line", d: d }),
				h("circle", { className: "pz-signal__dot", cx: w, cy: ht / 2, r: 5 }),
			),
			h(
				"div",
				{ className: "pz-signal__axis" },
				h("span", null, props.startLabel || "Start"),
				h("span", null, props.endLabel || "Acum"),
			),
			props.caption ? h("figcaption", { className: "pz-signal__caption" }, props.caption) : null,
		);
	}

	function NavBar(props) {
		var links = props.links || [];
		return h(
			"nav",
			{ className: cx("pz-nav", props.className), "aria-label": "Principal" },
			h(Logo, { size: 30, href: props.homeHref || "#" }),
			h(
				"div",
				{ className: "pz-nav__links" },
				links.map((l) =>
					h(
						"a",
						{ key: l.label, href: l.href || "#", "aria-current": l.current ? "page" : undefined },
						l.label,
					),
				),
			),
			h("div", { className: "pz-nav__actions" }, props.actions),
		);
	}

	function PractitionerCard(props) {
		var initials = (props.name || "")
			.split(" ")
			.map((p) => p.charAt(0))
			.slice(0, 2)
			.join("");
		return h(
			"article",
			{ className: cx("pz-person", props.className) },
			h(
				"div",
				{ className: "pz-person__avatar", "aria-hidden": props.photo ? undefined : true },
				props.photo ? h("img", { src: props.photo, alt: props.name }) : initials,
			),
			h(
				"div",
				null,
				h("h3", { className: "pz-person__name" }, props.name),
				props.role ? h("p", { className: "pz-person__role" }, props.role) : null,
			),
			props.specialties && props.specialties.length
				? h(
						"div",
						{ className: "pz-person__tags" },
						props.specialties.map((s) => h(Chip, { key: s, tone: "neutral" }, s)),
					)
				: null,
			props.action || null,
		);
	}

	function ArticleCard(props) {
		return h(
			"a",
			{ className: cx("pz-article", props.className), href: props.href || "#" },
			h(
				"div",
				{ className: "pz-article__media", "aria-hidden": props.image ? undefined : true },
				props.image
					? h("img", { src: props.image, alt: "" })
					: h(AmbientField, { intensity: "high", style: { height: "100%" } }),
			),
			h(
				"div",
				{ className: "pz-article__body" },
				props.topic ? h("span", { className: "pz-hub__eyebrow" }, props.topic) : null,
				h("h3", { className: "pz-article__title" }, props.title),
				props.excerpt ? h("p", { className: "pz-article__excerpt" }, props.excerpt) : null,
				h(
					"p",
					{ className: "pz-article__meta" },
					[
						props.author,
						props.minutes ? props.minutes + " min de citit" : null,
						props.reviewed ? "Revizuit de " + props.reviewed : null,
					]
						.filter(Boolean)
						.join(" · "),
				),
			),
		);
	}

	function Prose(props) {
		return h("div", { className: cx("pz-prose", props.className) }, props.children);
	}

	function fmt(t) {
		t = Math.max(0, Math.round(t || 0));
		return Math.floor(t / 60) + ":" + ("0" + (t % 60)).slice(-2);
	}
	function AudioPlayer(props) {
		var ref = React.useRef(null);
		var st = React.useState(false),
			playing = st[0],
			setPlaying = st[1];
		var tt = React.useState(0),
			time = tt[0],
			setTime = tt[1];
		var dur = props.duration || 0;
		function toggle() {
			var a = ref.current;
			if (a && props.src) {
				if (a.paused) {
					a.play();
				} else {
					a.pause();
				}
			} else {
				setPlaying(!playing);
			}
		}
		var bars = [],
			i,
			n = 48;
		for (i = 0; i < n; i++)
			bars.push(0.25 + 0.75 * Math.abs(Math.sin(i * 0.9) * Math.cos(i * 0.31)));
		var pct = dur ? time / dur : props.progress || 0;
		return h(
			"div",
			{ className: cx("pz-player", playing ? "is-playing" : null, props.className) },
			props.src
				? h("audio", {
						ref: ref,
						src: props.src,
						preload: "none",
						onPlay: () => {
							setPlaying(true);
						},
						onPause: () => {
							setPlaying(false);
						},
						onTimeUpdate: (e) => {
							setTime(e.target.currentTime);
						},
					})
				: null,
			h(
				"button",
				{
					type: "button",
					className: "pz-player__play",
					onClick: toggle,
					"aria-label": playing ? "Pauză" : "Redă",
				},
				playing
					? h(
							"svg",
							{
								width: 18,
								height: 18,
								viewBox: "0 0 24 24",
								fill: "currentColor",
								"aria-hidden": true,
							},
							h("rect", { x: 6, y: 5, width: 4, height: 14, rx: 1 }),
							h("rect", { x: 14, y: 5, width: 4, height: 14, rx: 1 }),
						)
					: h(
							"svg",
							{
								width: 18,
								height: 18,
								viewBox: "0 0 24 24",
								fill: "currentColor",
								"aria-hidden": true,
							},
							h("path", {
								d: "M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z",
							}),
						),
			),
			h(
				"div",
				{ className: "pz-player__body" },
				h(
					"div",
					{ className: "pz-player__head" },
					h("span", { className: "pz-player__title" }, props.title),
					props.meta ? h("span", { className: "pz-player__meta" }, props.meta) : null,
				),
				h(
					"div",
					{ className: "pz-player__wave", "aria-hidden": true },
					bars.map((b, k) =>
						h("span", {
							key: k,
							className: k / n <= pct ? "on" : null,
							style: { height: Math.round(b * 100) + "%" },
						}),
					),
				),
				h(
					"div",
					{ className: "pz-player__time" },
					h("span", null, fmt(time || pct * dur)),
					h("span", null, dur ? fmt(dur) : ""),
				),
			),
		);
	}

	function ProgramTracker(props) {
		var total = props.total || 21,
			done = props.done || 0,
			today = done + 1,
			days = [],
			i;
		for (i = 1; i <= total; i++) days.push(i);
		return h(
			"section",
			{
				className: cx("pz-tracker", props.className),
				"aria-label": props.title || "Programul tău",
			},
			h(
				"div",
				{ className: "pz-tracker__head" },
				h(
					"div",
					null,
					h("div", { className: "pz-tracker__title" }, props.title || "Programul tău"),
					h(
						"div",
						{ className: "pz-tracker__sub" },
						"Ziua " + Math.min(today, total) + " din " + total,
					),
				),
				h("div", { className: "pz-tracker__count" }, done + "/" + total),
			),
			h(
				"ol",
				{ className: "pz-tracker__days" },
				days.map((d) => {
					var state = d <= done ? "done" : d === today ? "today" : "next";
					return h(
						"li",
						{
							key: d,
							className: "pz-tracker__day is-" + state,
							"aria-label":
								"Ziua " + d + (state === "done" ? ", completă" : state === "today" ? ", azi" : ""),
						},
						d,
					);
				}),
			),
			props.note ? h("p", { className: "pz-tracker__note" }, props.note) : null,
		);
	}

	function ProductCard(props) {
		return h(
			"article",
			{ className: cx("pz-product", props.className) },
			h(
				"div",
				{ className: "pz-product__media" },
				props.image
					? h("img", { src: props.image, alt: "" })
					: h(AmbientField, { intensity: "high", style: { height: "100%" } }),
				props.badge ? h("span", { className: "pz-product__badge" }, props.badge) : null,
			),
			h(
				"div",
				{ className: "pz-product__body" },
				props.kind ? h("span", { className: "pz-hub__eyebrow" }, props.kind) : null,
				h("h3", { className: "pz-product__title" }, props.title),
				props.text ? h("p", { className: "pz-product__text" }, props.text) : null,
				h(
					"div",
					{ className: "pz-product__foot" },
					h("span", { className: "pz-product__price" }, props.price),
					h(
						Button,
						{ size: "sm", variant: props.secondary ? "glass" : "primary" },
						props.action || "Adaugă în coș",
					),
				),
			),
		);
	}

	window.Psizone = window.Psizone || {};
	Object.assign(window.Psizone, {
		Logo: Logo,
		AmbientField: AmbientField,
		Button: Button,
		GlassCard: GlassCard,
		Chip: Chip,
		StatusBadge: StatusBadge,
		TextField: TextField,
		AskBar: AskBar,
		GuideMessage: GuideMessage,
		HubCard: HubCard,
		ProgressSignal: ProgressSignal,
		NavBar: NavBar,
		PractitionerCard: PractitionerCard,
		ArticleCard: ArticleCard,
		Prose: Prose,
		AudioPlayer: AudioPlayer,
		ProgramTracker: ProgramTracker,
		ProductCard: ProductCard,
	});
})();
