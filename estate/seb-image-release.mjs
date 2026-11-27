#!/usr/bin/env node
// Are the images the estate builds from SEB built from the SEB release the estate has locked?
//
// An estate builds some of SEB's images itself (scripts/estate-images.sh: Polaris with its own
// authorization inputs, the shared apps with its names), tags them `seb-<commit>` and pins the tag in
// its component (estate/seb-components/<piece>/kustomization.yaml). Taking a bundle moves the pieces'
// manifests to the new release; it never moved those images. an estate took 0.1.118 … 0.1.138 while its
// Polaris stayed its own 0.1.117 build, and nothing said so (found 2026-11-15, when the hub fix of
// 0.1.140 did not reach the cluster with the bundle that carried it).
//
//   node estate/seb-image-release.mjs [--root <estate repo>] [--commit <sha> | --bundle-json <file>]
//                                     [--image-first <file>]
//
// The release is the locked bundle's source commit: --commit (the take, before it writes the lock),
// else --bundle-json or <root>/.seb-bundle/bundle.json, accepted only when its version is the one
// estate/platform.lock names (a bundle of another version answers for another release).
//
// Every component image whose tag is `seb-<hex>[-<suffix>]` is a SEB build and is compared: its hex
// must be a prefix of the release commit. A tag of another shape is the estate's own build (from its
// own source) and is listed, not compared.
//
// A HOLD keeps one image on an older build on purpose, documented in estate/seb-image-holds, one per
// line: `<piece> <repository> <tag> <why>` (# comments). It names the exact tag it holds, so a rebuild
// ends it; a hold that matches nothing, or names the release's own build, is refused as stale.
//
// An IMAGE-FIRST piece (the take only: --image-first, written by SEB tools/estate/image-first.mjs
// --exempt from the release's `Take-Needs: image-first=<piece>`) waits for its image built from the
// release: the take holds its Application on the previous bundle, and the pin of the new build moves
// both. So at take time its image is the PREVIOUS release's build, and that is held, not refused —
// otherwise image-first could never hold anything through a real take. One line per image the
// release leaves for the estate to build in that piece: `<piece> <repository> <previous release's
// 40-hex commit> <release version>`. Exactly those images, and only when built from that previous
// commit: an older build (one release skipped) is still behind, and so is every other image.
//
// One line per image: OK | HELD | BEHIND | OWN, then a summary, and a line `held: <piece> waits for
// <repository> built from <version>` per image-first hold. Exit 0: none behind and no stale hold;
// 1: an image behind the release (named) or a stale/malformed hold; 2: the release cannot be read.
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// One `images:` entry: `- name:` and the keys indented under it (newName, newTag, digest), in any order.
const IMAGE_ENTRY =
	/^([ \t]*)-[ \t]*name:[ \t]*"?([^"\s]+)"?[ \t]*\n((?:\1[ \t]+[A-Za-z]+:[^\n]*\n?)*)/gm;
const ENTRY_KEY = /^[ \t]+(newName|newTag):[ \t]*"?([^"\s]+)"?[ \t]*$/gm;
const SEB_TAG = /^seb-([0-9a-f]{7,40})(?:-[0-9A-Za-z._-]+)?$/;

/** @typedef {{ piece: string, repo: string, tag: string }} Pin */
/** @typedef {{ piece: string, repo: string, tag: string, why: string, line: number }} Hold */
/** @typedef {{ piece: string, repo: string, previous: string, version: string }} ImageFirst */

/** Every estate-built image pin, from every component. @param {string} root @returns {Pin[]} */
export function pins(root) {
	const dir = join(root, "estate/seb-components");
	if (!existsSync(dir)) return [];
	/** @type {Pin[]} */
	const out = [];
	for (const piece of readdirSync(dir).sort()) {
		const f = join(dir, piece, "kustomization.yaml");
		if (!existsSync(f)) continue;
		for (const pin of componentPins(readFileSync(f, "utf8"))) out.push({ piece, ...pin });
	}
	return out;
}

/**
 * The estate-built images one component pins, with the repository they run under. Two forms:
 * `name: WLREGISTRY/WLAPPS/<repo>` (the token SEB's render carries), and an estate's own name over
 * SEB's render — `name: <registry>/<project>/<SEB's repo>` renamed with `newName` inside the SAME
 * registry project (an estate that runs invoice-svc under its own repository name). Either may carry `newName`;
 * the repository is then newName's. A rename into another project (a mirror) is not an estate build.
 * @param {string} text @returns {Array<{ repo: string, tag: string }>}
 */
export function componentPins(text) {
	/** @type {Array<{ repo: string, tag: string }>} */
	const out = [];
	for (const m of text.matchAll(IMAGE_ENTRY)) {
		const name = m[2] ?? "";
		/** @type {Record<string, string>} */
		const keys = {};
		for (const k of (m[3] ?? "").matchAll(ENTRY_KEY)) keys[k[1] ?? ""] = k[2] ?? "";
		const tag = keys.newTag;
		if (tag === undefined) continue;
		const newName = keys.newName;
		const dir = (/** @type {string} */ ref) => ref.slice(0, ref.lastIndexOf("/") + 1);
		const last = (/** @type {string} */ ref) => ref.slice(ref.lastIndexOf("/") + 1);
		const token = /^WLREGISTRY\/WLAPPS\/([A-Za-z0-9._/-]+)$/.exec(name);
		if (token) out.push({ repo: newName === undefined ? (token[1] ?? "") : last(newName), tag });
		else if (newName !== undefined && name.includes("/") && dir(name) === dir(newName))
			out.push({ repo: last(newName), tag });
	}
	return out;
}

/**
 * estate/seb-image-holds, parsed. A line that is not `<piece> <repository> <tag> <why>` with a
 * reason of at least 10 characters is an error, by line number.
 * @param {string} text @returns {{ holds: Hold[], errors: string[] }}
 */
export function parseHolds(text) {
	/** @type {Hold[]} */
	const holds = [];
	/** @type {string[]} */
	const errors = [];
	text.split("\n").forEach((raw, i) => {
		const line = raw.replace(/#.*$/, "").trim();
		if (line === "") return;
		const m = /^(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/.exec(line);
		if (!m || (m[4] ?? "").trim().length < 10)
			errors.push(
				`estate/seb-image-holds line ${i + 1}: a hold is "<piece> <repository> <tag> <why>", with why it is held`,
			);
		else
			holds.push({
				piece: m[1] ?? "",
				repo: m[2] ?? "",
				tag: m[3] ?? "",
				why: (m[4] ?? "").trim(),
				line: i + 1,
			});
	});
	return { holds, errors };
}

/**
 * The --image-first file, parsed: `<piece> <repository> <previous commit> <version>` per line. A line
 * of another shape is an error, by line number (the take refuses on it).
 * @param {string} text @returns {{ entries: ImageFirst[], errors: string[] }}
 */
export function parseImageFirst(text) {
	/** @type {ImageFirst[]} */
	const entries = [];
	/** @type {string[]} */
	const errors = [];
	text.split("\n").forEach((raw, i) => {
		const line = raw.trim();
		if (line === "") return;
		const m = /^([a-z0-9_-]+)\s+([A-Za-z0-9._-]+)\s+([0-9a-f]{40})\s+(\S+)$/.exec(line);
		if (!m)
			errors.push(
				`--image-first line ${i + 1}: not "<piece> <repository> <previous commit> <version>"`,
			);
		else
			entries.push({
				piece: m[1] ?? "",
				repo: m[2] ?? "",
				previous: m[3] ?? "",
				version: m[4] ?? "",
			});
	});
	return { entries, errors };
}

/**
 * The verdict, pure.
 * @param {Pin[]} all @param {Hold[]} holds @param {string} commit @param {ImageFirst[]} [imageFirst]
 * @returns {{ lines: string[], behind: string[], errors: string[], held: string[] }}
 */
export function judge(all, holds, commit, imageFirst = []) {
	const lines = [];
	const behind = [];
	const errors = [];
	const held = [];
	const used = new Set();
	const short = commit.slice(0, 9);
	for (const p of all) {
		const name = `${p.piece}/${p.repo}:${p.tag}`;
		const m = SEB_TAG.exec(p.tag);
		if (!m) {
			lines.push(`OWN     ${name} (not a SEB build: not compared)`);
			continue;
		}
		const hold = holds.find((h) => h.piece === p.piece && h.repo === p.repo && h.tag === p.tag);
		const first = imageFirst.find((f) => f.piece === p.piece && f.repo === p.repo);
		if (commit.startsWith(m[1] ?? "")) {
			lines.push(`OK      ${name} = release ${short}`);
			if (hold) {
				used.add(hold);
				errors.push(
					`estate/seb-image-holds line ${hold.line}: ${name} is the release's own build — the hold is stale, remove it`,
				);
			}
		} else if (hold) {
			used.add(hold);
			lines.push(`HELD    ${name}, release ${short}: ${hold.why}`);
		} else if (first?.previous.startsWith(m[1] ?? "")) {
			lines.push(
				`HELD    ${name}, release ${short}: image-first — the previous release's build (${first.previous.slice(0, 9)}), held until ${p.repo} is built from ${first.version}`,
			);
			held.push(`held: ${p.piece} waits for ${p.repo} built from ${first.version}`);
		} else if (first) {
			behind.push(name);
			lines.push(
				`BEHIND  ${name}, but the locked release is ${short}: image-first holds only the previous release's build (${first.previous.slice(0, 9)})`,
			);
		} else {
			behind.push(name);
			lines.push(`BEHIND  ${name}, but the locked release is ${short}`);
		}
	}
	for (const h of holds)
		if (!used.has(h))
			errors.push(
				`estate/seb-image-holds line ${h.line}: no component pins ${h.piece}/${h.repo}:${h.tag} — the hold is stale, remove it`,
			);
	return { lines, behind, errors, held };
}

/** The lock's version. @param {string} root @returns {string} */
function lockVersion(root) {
	const f = join(root, "estate/platform.lock");
	if (!existsSync(f)) return "";
	return /^version\s*=\s*(\S+)\s*$/m.exec(readFileSync(f, "utf8"))?.[1] ?? "";
}

/**
 * The locked release's commit, or why it cannot be read.
 * @param {string} root @param {string | undefined} commit @param {string | undefined} bundleJson
 * @returns {{ ok: true, commit: string } | { ok: false, error: string }}
 */
export function releaseCommit(root, commit, bundleJson) {
	if (commit !== undefined)
		return /^[0-9a-f]{40}$/.test(commit)
			? { ok: true, commit }
			: { ok: false, error: `--commit "${commit}" is not a 40-hex commit` };
	const version = lockVersion(root);
	if (version === "") return { ok: false, error: "estate/platform.lock names no version" };
	const f = bundleJson ?? join(root, ".seb-bundle/bundle.json");
	if (!existsSync(f))
		return { ok: false, error: `no bundle.json at ${f} (install the locked bundle)` };
	/** @type {unknown} */
	let b;
	try {
		b = JSON.parse(readFileSync(f, "utf8"));
	} catch {
		return { ok: false, error: `${f} is not JSON` };
	}
	const got = /** @type {{ version?: unknown, source?: { commit?: unknown } }} */ (b);
	if (got.version !== version)
		return {
			ok: false,
			error: `${f} is bundle ${String(got.version)}, not the locked ${version} (install the locked bundle)`,
		};
	const c = got.source?.commit;
	return typeof c === "string" && /^[0-9a-f]{40}$/.test(c)
		? { ok: true, commit: c }
		: { ok: false, error: `${f} records no source commit` };
}

/** @param {string[]} argv @returns {number} */
export function main(argv) {
	/** @type {Record<string, string>} */
	const o = {};
	for (let i = 0; i < argv.length; i += 2) {
		const k = argv[i] ?? "";
		if (
			!["--root", "--commit", "--bundle-json", "--image-first"].includes(k) ||
			argv[i + 1] === undefined
		) {
			process.stderr.write(
				"usage: seb-image-release.mjs [--root <repo>] [--commit <sha> | --bundle-json <file>] [--image-first <file>]\n",
			);
			return 2;
		}
		o[k] = argv[i + 1] ?? "";
	}
	const root = resolve(o["--root"] ?? join(import.meta.dirname, ".."));
	const rel = releaseCommit(root, o["--commit"], o["--bundle-json"]);
	if (!rel.ok) {
		process.stdout.write(`UNREADABLE: ${rel.error}\n`);
		return 2;
	}
	const hf = join(root, "estate/seb-image-holds");
	const { holds, errors: holdErrors } = parseHolds(existsSync(hf) ? readFileSync(hf, "utf8") : "");
	const ff = o["--image-first"];
	if (ff !== undefined && !existsSync(ff)) {
		process.stdout.write(`UNREADABLE: no --image-first file at ${ff}\n`);
		return 2;
	}
	const { entries, errors: firstErrors } = parseImageFirst(
		ff === undefined ? "" : readFileSync(ff, "utf8"),
	);
	const { lines, behind, errors, held } = judge(pins(root), holds, rel.commit, entries);
	for (const l of lines) process.stdout.write(`${l}\n`);
	for (const h of held) process.stdout.write(`${h}\n`);
	for (const e of [...holdErrors, ...firstErrors, ...errors])
		process.stdout.write(`REFUSED: ${e}\n`);
	if (behind.length > 0)
		process.stdout.write(
			`BEHIND: ${behind.join(", ")} — built from another SEB commit than the locked release ${rel.commit.slice(0, 9)}: rebuild them from the release (scripts/estate-images.sh) or hold them in estate/seb-image-holds\n`,
		);
	return behind.length > 0 || holdErrors.length > 0 || firstErrors.length > 0 || errors.length > 0
		? 1
		: 0;
}

// Run as a program however it was reached (a symlinked bundle, a relative path): compare real paths.
if (
	process.argv[1] &&
	realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
)
	process.exit(main(process.argv.slice(2)));
