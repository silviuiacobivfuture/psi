#!/usr/bin/env node
// logos/marks/*.svg (hand-written, currentColor, second tone marked class="t2") → everything derived:
//
//   node scripts/build-logos.mjs           write the derived files
//   node scripts/build-logos.mjs --check   exit 1 when any committed derived file differs
//
// Output:
//   logos/marks.generated.ts      the inner markup of each mark, for `@psi/ui`'s Logo (inline SVG)
//   logos/mono/<mark>-{black,white}.svg   one colour, for print, emboss and one-colour contexts
//   logos/color/<mark>-{light,dark}.svg   the brand's own two tones from the theme tokens
//   logos/favicon/<brand>.svg     the compact cut, light/dark through prefers-color-scheme
//   apps/<site>/public/favicon.svg        the same favicon, one per site
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(root, "..", "..");
const check = process.argv.includes("--check");
const tokens = JSON.parse(readFileSync(join(root, "tokens.json"), "utf8"));
const tok = (name, theme) => {
	const v = tokens.color.tokens.find((t) => t.name === name)?.value[theme];
	if (v === undefined) throw new Error(`token ${name} has no value in ${theme}`);
	return v;
};

const BRANDS = {
	psizone: { name: "Psizone", apps: ["psizone-web", "design-gallery"] },
	eqsync: { name: "EQ-SYNC", apps: ["eqsync-web"] },
	hemisync: { name: "Hemi-Sync România", apps: ["hemisync-web"] },
	blog: { name: "Blog", apps: ["blog-web"] },
};
const CUTS = ["full", "compact"];

const sourceOf = (brand, cut) =>
	readFileSync(
		join(root, "logos", "marks", `${brand}${cut === "compact" ? "-compact" : ""}.svg`),
		"utf8",
	).trim();
const OPEN = /^<svg ([^>]*)>\n?/;
const inner = (svg) =>
	svg
		.replace(OPEN, "")
		.replace(/<\/svg>$/, "")
		.replace(/\n/g, "");
const attrs = (svg) => svg.match(OPEN)?.[1] ?? "";

/** `color` on the root and on each second-tone element, as presentation attributes (no CSS needed). */
function tinted(svg, one, two, title) {
	const body = svg
		.replace(OPEN, (_, a) => `<svg ${a} color="${one}">\n<title>${title}</title>\n`)
		.replace(/class="t2"/g, `class="t2" color="${two}"`);
	return body;
}
function favicon(brand) {
	const light = (n) => tok(n, `${brand}-light`);
	const dark = (n) => tok(n, `${brand}-dark`);
	const css = `svg{color:${light("glow-1")}}.t2{color:${light("glow-2")}}@media(prefers-color-scheme:dark){svg{color:${dark("glow-1")}}.t2{color:${dark("glow-2")}}}`;
	return sourceOf(brand, "compact").replace(
		OPEN,
		(_, a) => `<svg ${a}>\n<title>${BRANDS[brand].name}</title>\n<style>${css}</style>\n`,
	);
}

const files = new Map();
let ts = `// GENERATED from logos/marks/*.svg by scripts/build-logos.mjs — do not edit.\n`;
const markAttrs = Object.fromEntries(
	[...attrs(sourceOf("psizone", "full")).matchAll(/([\w-]+)="([^"]*)"/g)]
		.filter(([, k]) => k !== "xmlns")
		.map(([, k, v]) => [k, v]),
);
ts += `/** The root attributes every mark shares. */\nexport const MARK_ATTRS = ${JSON.stringify(markAttrs)} as const;\n\n`;
ts += `export type MarkBrand = ${Object.keys(BRANDS)
	.map((b) => JSON.stringify(b))
	.join(" | ")};\nexport type MarkCut = "full" | "compact";\n\n`;
ts += `/** The inner markup of each mark on a 64 × 64 grid: \`currentColor\`, the second tone under \`.t2\`. */\nexport const MARKS: Readonly<Record<MarkBrand, Readonly<Record<MarkCut, string>>>> = {\n`;
for (const [brand, meta] of Object.entries(BRANDS)) {
	ts += `\t${brand}: {\n`;
	for (const cut of CUTS) ts += `\t\t${cut}: ${JSON.stringify(inner(sourceOf(brand, cut)))},\n`;
	ts += `\t},\n`;
	for (const cut of CUTS) {
		const stem = `${brand}${cut === "compact" ? "-compact" : ""}`;
		const svg = sourceOf(brand, cut);
		files.set(`logos/mono/${stem}-black.svg`, `${tinted(svg, "#000000", "#000000", meta.name)}\n`);
		files.set(`logos/mono/${stem}-white.svg`, `${tinted(svg, "#FFFFFF", "#FFFFFF", meta.name)}\n`);
		for (const mode of ["light", "dark"]) {
			const theme = `${brand}-${mode}`;
			files.set(
				`logos/color/${stem}-${mode}.svg`,
				`${tinted(svg, tok("glow-1", theme), tok("glow-2", theme), meta.name)}\n`,
			);
		}
	}
	files.set(`logos/favicon/${brand}.svg`, favicon(brand));
	for (const app of meta.apps) files.set(`apps/${app}/public/favicon.svg`, favicon(brand));
}
ts += `};\n`;
files.set("logos/marks.generated.ts", ts);

let stale = 0;
for (const [rel, text] of files) {
	const base = rel.startsWith("apps/") ? repo : root;
	const path = join(base, rel);
	const current = existsSync(path) ? readFileSync(path, "utf8") : null;
	if (current === text) continue;
	if (check) {
		console.error(`stale: ${rel}`);
		stale += 1;
		continue;
	}
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, text);
	console.log(`wrote ${rel}`);
}
if (check && stale > 0) {
	console.error(
		`${stale} logo file(s) differ from logos/marks: run pnpm --filter @psi/design build:logos`,
	);
	process.exit(1);
}
const expected = new Set(
	CUTS.flatMap((c) =>
		Object.keys(BRANDS).map((b) => `${b}${c === "compact" ? "-compact" : ""}.svg`),
	),
);
for (const f of readdirSync(join(root, "logos", "marks")))
	if (!expected.has(f)) throw new Error(`logos/marks/${f} is not a known mark`);
