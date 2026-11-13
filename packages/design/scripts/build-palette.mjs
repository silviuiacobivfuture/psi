#!/usr/bin/env node
// tokens.json → PALETTE.md: every theme's colour roles and the WCAG contrast of every pair the
// brand books promise. Exits 1 when a pair is below its minimum, so a failing palette never ships.
//
//   node scripts/build-palette.mjs           write PALETTE.md
//   node scripts/build-palette.mjs --check   exit 1 when PALETTE.md differs or a pair fails
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "PALETTE.md");
const tokens = JSON.parse(readFileSync(join(root, "tokens.json"), "utf8"));
const themes = tokens.color.themes;
const value = (role, theme) => {
	const t = tokens.color.tokens.find((x) => x.name === role);
	if (t === undefined) throw new Error(`no colour role ${role}`);
	return t.value[theme];
};

/** @param {string} hex */
function luminance(hex) {
	const h = hex.replace("#", "");
	const c = [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255);
	const [r, g, b] = c.map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** @param {string} a @param {string} b */
function contrast(a, b) {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

const ROLES = [
	"bg",
	"surface-1",
	"surface-2",
	"ink",
	"ink-muted",
	"ink-faint",
	"glow-1",
	"glow-2",
	"glow-3",
	"accent",
	"on-accent",
	"focus",
	"line-control",
];
/** [text, ground, minimum] — text 4.5:1, focus ring and control borders 3:1. */
const PAIRS = [
	["ink", "bg", 4.5],
	["ink", "surface-2", 4.5],
	["ink-muted", "bg", 4.5],
	["ink-muted", "surface-2", 4.5],
	["ink-faint", "surface-2", 4.5],
	["glow-1", "bg", 4.5],
	["on-accent", "accent", 4.5],
	["on-accent", "accent-hover", 4.5],
	["focus", "surface-2", 3],
	["line-control", "surface-2", 3],
];

const head = `| Role | ${themes.map((t) => t.name).join(" | ")} |\n| --- | ${themes.map(() => "---").join(" | ")} |`;
const roleRows = ROLES.map(
	(r) => `| ${r} | ${themes.map((t) => `\`${value(r, t.id)}\``).join(" | ")} |`,
);
const failures = [];
const pairRows = PAIRS.map(([a, b, min]) => {
	const cells = themes.map((t) => {
		const r = contrast(value(a, t.id), value(b, t.id));
		if (r < min) failures.push(`${t.id}: ${a} on ${b} ${r.toFixed(2)} < ${min}`);
		return r < min ? `**${r.toFixed(2)} ✗**` : r.toFixed(2);
	});
	return `| ${a} on ${b} (≥ ${min}) | ${cells.join(" | ")} |`;
});

const md = [
	"# Palette and contrast, all ten themes",
	"",
	"GENERATED from `tokens.json` by `scripts/build-palette.mjs` — do not edit. Ratios are WCAG 2",
	"contrast. Minimums: text 4.5:1; focus ring and control borders 3:1. `glow-2` and `glow-3` are",
	"decorative only and are not checked as text.",
	"",
	head,
	...roleRows,
	"",
	"## Contrast checks",
	"",
	`| Pair | ${themes.map((t) => t.name).join(" | ")} |\n| --- | ${themes.map(() => "---").join(" | ")} |`,
	...pairRows,
	"",
].join("\n");

if (process.argv.includes("--check")) {
	let current = "";
	try {
		current = readFileSync(OUT, "utf8");
	} catch {
		current = "";
	}
	if (current !== md) {
		console.error("PALETTE.md is stale: run `pnpm --filter @psi/design build`");
		process.exit(1);
	}
} else {
	writeFileSync(OUT, md);
}
if (failures.length > 0) {
	console.error(`contrast below minimum:\n  ${failures.join("\n  ")}`);
	process.exit(1);
}
console.log(`PALETTE.md: ${themes.length} themes, ${PAIRS.length} pairs each, all pass`);
