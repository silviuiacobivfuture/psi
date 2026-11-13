#!/usr/bin/env node
// tokens.json → theme.generated.css: the psi design language as CSS.
//
//   node scripts/build-theme.mjs           write theme.generated.css
//   node scripts/build-theme.mjs --check   exit 1 when the committed file differs from tokens.json
//
// Output, in order:
//   1. one block per theme of every colour and shadow role; the first theme also answers `:root`
//   2. `:root` with the theme-independent scales the component styles read (space, blur)
//   3. Tailwind 4 `@theme inline`: colour utilities bound to the roles (bg-surface-1, text-ink …)
//   4. Tailwind 4 `@theme static`: families, radii, blur, the type scale (display sizes fluid)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "theme.generated.css");
const tokens = JSON.parse(readFileSync(join(root, "tokens.json"), "utf8"));

const themes = tokens.color.themes.map((t) => t.id);
const perTheme = [...tokens.color.tokens, ...tokens.shadow.tokens];
/** Roles that exist only in the admin themes (status, calendar columns, app tints) and the admin density scale. */
const adminRoles = tokens.color.adminTokens ?? [];
const density = tokens.density?.tokens ?? [];
const isAdmin = (id) => id.startsWith("admin-");

/** Display sizes scale with the viewport; the token value is the maximum. */
const FLUID_MIN = { "display-xl": 56, "display-lg": 36, "display-md": 32, headline: 26, quote: 22 };

/** @param {string} px @param {string} name */
function size(px, name) {
	const max = Number.parseFloat(px);
	const min = FLUID_MIN[name];
	if (min === undefined) return px;
	const vw = ((max / 1440) * 100).toFixed(2);
	return `clamp(${min}px, ${vw}vw + 0.5rem, ${max}px)`;
}

const lines = ["/* GENERATED from tokens.json by scripts/build-theme.mjs — do not edit. */", ""];

themes.forEach((id, i) => {
	lines.push(`${i === 0 ? ":root,\n" : ""}[data-theme="${id}"] {`);
	lines.push(`\tcolor-scheme: ${id.endsWith("dark") ? "dark" : "light"};`);
	for (const t of perTheme) {
		const v = t.value[id];
		if (v === undefined) throw new Error(`token ${t.name} has no value for theme ${id}`);
		lines.push(`\t--${t.name}: ${v};`);
	}
	if (isAdmin(id)) {
		for (const t of adminRoles) {
			const v = t.value[id];
			if (v === undefined) throw new Error(`admin token ${t.name} has no value for theme ${id}`);
			lines.push(`\t--${t.name}: ${v};`);
		}
		for (const t of density) lines.push(`\t--${t.name}: ${t.value};`);
	}
	lines.push("}", "");
});

lines.push(":root {");
for (const t of tokens.spacing.tokens) lines.push(`\t--${t.name}: ${t.value};`);
lines.push("}", "");

lines.push("@theme inline {");
for (const t of [...tokens.color.tokens, ...adminRoles])
	lines.push(`\t--color-${t.name}: var(--${t.name});`);
lines.push("\t--font-body: var(--pz-body);", "\t--font-label: var(--pz-label);", "}", "");

lines.push("@theme static {");
for (const [k, v] of Object.entries(tokens.type.families)) lines.push(`\t--font-${k}: ${v};`);
for (const t of tokens.radius.tokens) lines.push(`\t--${t.name}: ${t.value};`);
for (const t of tokens.blur.tokens) lines.push(`\t--${t.name}: ${t.value};`);
for (const g of tokens.type.groups) {
	for (const s of g.styles) {
		const p = `--text-${s.name}`;
		lines.push(`\t${p}: ${size(s.fontSize, s.name)};`);
		const lh = typeof s.lineHeight === "number" ? String(s.lineHeight) : s.lineHeight;
		lines.push(`\t${p}--line-height: ${lh};`);
		if (s.letterSpacing) lines.push(`\t${p}--letter-spacing: ${s.letterSpacing};`);
		if (s.fontWeight) lines.push(`\t${p}--font-weight: ${s.fontWeight};`);
	}
}
lines.push("}", "");

const css = lines.join("\n");

if (process.argv.includes("--check")) {
	let current = "";
	try {
		current = readFileSync(OUT, "utf8");
	} catch {
		current = "";
	}
	if (current !== css) {
		console.error("theme.generated.css is stale: run `pnpm --filter @psi/design build`");
		process.exit(1);
	}
	console.log("theme.generated.css matches tokens.json");
} else {
	writeFileSync(OUT, css);
	console.log(
		`theme.generated.css: ${themes.length} themes, ${perTheme.length} roles each (+${adminRoles.length} admin roles)`,
	);
}
