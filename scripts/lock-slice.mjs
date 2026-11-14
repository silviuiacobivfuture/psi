// The part of pnpm-lock.yaml one image installs from, for scripts/affected-apps.mjs.
//
// An image runs `pnpm install --frozen-lockfile --filter "<pkg>..."`: it installs the importers of
// <pkg> and its workspace dependencies and the packages they resolve to, transitively. Two lockfiles
// install the same thing for it when that slice is byte-for-byte equal: the lockfile's header
// (version, settings, overrides, catalogs, pnpmfile checksum), the root importer, each importer in the
// set, and every `snapshots:`/`packages:` entry reachable from them. Most lockfile changes add one
// workspace link to one importer; before this, every one of them rebuilt every image.
//
// FAIL-CLOSED: a lockfile this does not understand (another lockfileVersion, a dependency that
// resolves to no entry) yields null, and the caller counts the app as affected.

const SECTIONS = new Set(["importers", "packages", "snapshots"]);

/** @param {string} s @returns {string} */
const unquote = (s) => s.replace(/^'(.*)'$/, "$1").replace(/^"(.*)"$/, "$1");

/**
 * @param {string} text
 * @returns {{ header: string, importers: Map<string, string>, packages: Map<string, string>, snapshots: Map<string, string> } | null}
 */
export function parseLock(text) {
	if (!/^lockfileVersion: '9\.0'$/m.test(text)) return null;
	const header = [];
	/** @type {Record<string, Map<string, string>>} */
	const out = { importers: new Map(), packages: new Map(), snapshots: new Map() };
	let section = "";
	let key = "";
	let block = [];
	const flush = () => {
		if (key !== "") out[section].set(key, block.join("\n"));
		key = "";
		block = [];
	};
	for (const line of text.split("\n")) {
		if (/^\S/.test(line)) {
			if (SECTIONS.has(section)) flush();
			section = line.replace(/:.*$/, "");
			if (!SECTIONS.has(section)) header.push(line);
			continue;
		}
		if (!SECTIONS.has(section)) {
			header.push(line);
			continue;
		}
		// `  name@1.0.0:` opens a block; a leaf is written inline, `  name@1.0.0: {}`.
		const entry = /^ {2}(\S.*?):(?: \{\})?$/.exec(line);
		if (entry) {
			flush();
			key = unquote(entry[1]);
		}
		if (key !== "" && line.trim() !== "") block.push(line);
	}
	if (SECTIONS.has(section)) flush();
	return { header: header.join("\n").trim(), ...out };
}

/** @param {string} block an importer's lines @returns {Array<[string, string]>} [name, version] */
function importerDeps(block) {
	const deps = [];
	let name = "";
	for (const line of block.split("\n")) {
		const n = /^ {6}(\S.*):$/.exec(line);
		if (n) name = unquote(n[1]);
		const v = /^ {8}version: (.+)$/.exec(line);
		if (v && name !== "") deps.push([name, unquote(v[1].trim())]);
	}
	return deps;
}

/** @param {string} block a snapshot's lines @returns {Array<[string, string]>} */
function snapshotDeps(block) {
	const deps = [];
	let inDeps = false;
	for (const line of block.split("\n")) {
		const sub = /^ {4}(\S+):/.exec(line);
		if (sub) inDeps = sub[1] === "dependencies" || sub[1] === "optionalDependencies";
		const d = /^ {6}(.+?): (.+)$/.exec(line);
		if (inDeps && d) deps.push([unquote(d[1]), unquote(d[2].trim())]);
	}
	return deps;
}

/**
 * The slice of a parsed lockfile the given importers install from, as one string; null when a
 * dependency resolves to no entry.
 * @param {NonNullable<ReturnType<typeof parseLock>>} lock
 * @param {string[]} importerPaths e.g. ["apps/site", "packages/ui"]; the root importer is always in
 * @returns {string | null}
 */
export function slice(lock, importerPaths) {
	const parts = [`H ${lock.header}`];
	const queue = [];
	for (const path of [".", ...[...new Set(importerPaths)].sort()]) {
		const block = lock.importers.get(path);
		parts.push(`I ${path}\n${block ?? "<absent>"}`);
		if (block !== undefined) queue.push(...importerDeps(block));
	}
	const seen = new Set();
	while (queue.length > 0) {
		const next = queue.pop();
		if (next === undefined) break;
		const [name, version] = next;
		if (version.startsWith("link:")) continue;
		const key = lock.snapshots.has(`${name}@${version}`) ? `${name}@${version}` : version;
		const snap = lock.snapshots.get(key);
		if (snap === undefined) return null;
		if (seen.has(key)) continue;
		seen.add(key);
		queue.push(...snapshotDeps(snap));
	}
	for (const key of [...seen].sort()) {
		const base = key.includes("(") ? key.slice(0, key.indexOf("(")) : key;
		parts.push(`S ${lock.snapshots.get(key)}\nP ${lock.packages.get(base) ?? "<absent>"}`);
	}
	return parts.join("\n");
}

/**
 * Whether the two lockfiles install anything different for these importers. True (affected) when
 * either cannot be read.
 * @param {string} before @param {string} after @param {string[]} importerPaths @returns {boolean}
 */
export function sliceChanged(before, after, importerPaths) {
	const a = parseLock(before);
	const b = parseLock(after);
	if (a === null || b === null) return true;
	const sa = slice(a, importerPaths);
	const sb = slice(b, importerPaths);
	return sa === null || sb === null || sa !== sb;
}
