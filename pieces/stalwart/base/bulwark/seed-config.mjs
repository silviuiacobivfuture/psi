// The estate's look into Bulwark's own theme store, run by the bulwark Deployment's seed-config
// init container on every start (bulwark.yaml), in Bulwark's own image (node, no packages).
//
//   THEME_DIR/estate.css   the estate's theme (the `bulwark-theme` slot)
//   ADMIN_CONFIG_DIR       Bulwark's config directory (its volume)
//
// Writes, in the layout Bulwark's admin dashboard writes (lib/admin/plugin-registry.ts, 1.21.2):
//   themes/estate.css        the CSS
//   themes/registry.json     one entry, id `estate`, enabled, contentHash = sha256(css \0 skin)
//   policy.json              themePolicy.defaultThemeId = "estate"; every other key kept
// Anything an administrator set elsewhere (other themes, other policy keys) is left as it is.
// Idempotent: an unchanged theme rewrites nothing. Fails loud on a missing or empty theme.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const THEME_ID = "estate";
const themeDir = process.env.THEME_DIR;
const configDir = process.env.ADMIN_CONFIG_DIR;
if (!themeDir || !configDir) {
	console.error("MISSING REQUIRED CONFIG: THEME_DIR and ADMIN_CONFIG_DIR");
	process.exit(1);
}
const cssPath = join(themeDir, "estate.css");
if (!existsSync(cssPath)) {
	console.error(`MISSING REQUIRED INPUT: ${cssPath}`);
	process.exit(1);
}
const css = readFileSync(cssPath, "utf8");
if (!css.trim()) {
	console.error(`MISSING REQUIRED INPUT: ${cssPath} is empty`);
	process.exit(1);
}

/** @param {string} path @param {string} text */
function writeAtomic(path, text) {
	const tmp = `${path}.tmp`;
	writeFileSync(tmp, text);
	renameSync(tmp, path);
}
/** @param {string} path @returns {Record<string, unknown>} */
function readJson(path) {
	if (!existsSync(path)) return {};
	const text = readFileSync(path, "utf8");
	if (!text.trim()) return {};
	const value = JSON.parse(text);
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		console.error(`REFUSED: ${path} is not a JSON object`);
		process.exit(1);
	}
	return value;
}

// Read and judge everything first: a refusal writes nothing.
const themes = join(configDir, "themes");
const contentHash = createHash("sha256").update(css).update("\0").update("").digest("hex");
const registryPath = join(themes, "registry.json");
const registry = readJson(registryPath);
const list = Array.isArray(registry.themes) ? registry.themes : [];
const current = list.find((t) => t && t.id === THEME_ID);
const policyPath = join(configDir, "policy.json");
const policy = readJson(policyPath);
const themePolicy =
	typeof policy.themePolicy === "object" && policy.themePolicy !== null ? policy.themePolicy : {};

mkdirSync(themes, { recursive: true });
const cssFile = join(themes, `${THEME_ID}.css`);
const cssOnDisk = existsSync(cssFile) ? readFileSync(cssFile, "utf8") : null;
let changed = false;
if (cssOnDisk !== css) {
	writeAtomic(cssFile, css);
	changed = true;
}
if (!current || current.contentHash !== contentHash || current.enabled !== true) {
	const now = new Date().toISOString();
	const entry = {
		id: THEME_ID,
		name: "Estate",
		version: contentHash.slice(0, 12),
		author: "estate",
		description: "The estate's colours, marks and face, from its design tokens.",
		variants: ["light", "dark"],
		enabled: true,
		installedAt: current?.installedAt ?? now,
		updatedAt: now,
		hasSkin: false,
		contentHash,
	};
	const next = list.filter((t) => !(t && t.id === THEME_ID));
	next.push(entry);
	writeAtomic(registryPath, `${JSON.stringify({ ...registry, themes: next }, null, 2)}\n`);
	changed = true;
}
if (themePolicy.defaultThemeId !== THEME_ID) {
	writeAtomic(
		policyPath,
		`${JSON.stringify({ ...policy, themePolicy: { ...themePolicy, defaultThemeId: THEME_ID } }, null, 2)}\n`,
	);
	changed = true;
}
console.log(changed ? `estate theme ${contentHash.slice(0, 12)} written` : "estate theme unchanged");
