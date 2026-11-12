#!/usr/bin/env node
// Bump-in-place versioning, the same contract as the first estate's validate-version-bump:
//
//   commit-msg   (`version-bump.mjs <message file>`): the message's tag picks the bump —
//                [PATCH] x.y.Z+1, [UPDATE] x.Y+1.0, [RELEASE] X+1.0.0 — and every package
//                (nearest package.json with a version, never the root) that owns a staged file
//                has its version bumped and staged. One commit, however many packages it
//                touches; never split, never rewritten.
//   post-commit  (`version-bump.mjs --post-commit`): git snapshots the commit's tree BEFORE
//                commit-msg runs, so the bumps staged there are still in the index afterwards.
//                They are folded in with one amend — ONLY when the staged set is exactly the
//                bumped version files. Anything else staged is never touched.
//
// Exempt: a merge in progress (the merged commits carried their own bumps), fixup!/squash!/
// amend! messages (they inherit their target's tag). The tag itself is required by
// scripts/commit-msg.mjs, which runs first; this script only acts on it.
//
// Never edit a version by hand: this hook owns them.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/** @typedef {"patch" | "minor" | "major"} BumpType */
/** @typedef {{ dir: string, file: string, version: string }} Pkg */

/** @param {string} root @param {string[]} args */
function git(root, args) {
	return execFileSync("git", args, {
		cwd: root,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

/** @param {string} message @returns {BumpType | null} */
export function bumpTypeOf(message) {
	if (message.includes("[RELEASE]")) return "major";
	if (message.includes("[UPDATE]")) return "minor";
	if (message.includes("[PATCH]")) return "patch";
	return null;
}

/** @param {string} version @param {BumpType} type @returns {string} */
export function bumpVersion(version, type) {
	const [major = 0, minor = 0, patch = 0] = version.replace(/^v/, "").split(".").map(Number);
	switch (type) {
		case "major":
			return `${major + 1}.0.0`;
		case "minor":
			return `${major}.${minor + 1}.0`;
		case "patch":
			return `${major}.${minor}.${patch + 1}`;
		default: {
			/** @type {never} */
			const unreachable = type;
			throw new Error(`unknown bump type: ${String(unreachable)}`);
		}
	}
}

/** @param {string} root @returns {string[]} */
function stagedFiles(root) {
	return git(root, ["diff", "--cached", "--name-only", "--diff-filter=ACMR"])
		.split("\n")
		.filter(Boolean);
}

/** The nearest versioned package.json above a file, never the repository root. */
/** @param {string} root @param {string} file @returns {Pkg | null} */
export function nearestPackage(root, file) {
	let dir = dirname(resolve(root, file));
	while (dir.startsWith(root) && dir !== root) {
		const pj = join(dir, "package.json");
		if (existsSync(pj)) {
			/** @type {unknown} */
			const parsed = JSON.parse(readFileSync(pj, "utf8"));
			const version =
				typeof parsed === "object" && parsed !== null && "version" in parsed
					? parsed.version
					: undefined;
			if (typeof version === "string" && version !== "0.0.0") return { dir, file: pj, version };
		}
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return null;
}

/** @param {string} root */
function markerPath(root) {
	// Per worktree: `.git` is a file in a linked worktree, and two worktrees committing at once
	// must not share one marker.
	return join(git(root, ["rev-parse", "--absolute-git-dir"]).trim(), "VERSION_BUMP_PENDING");
}

/** @param {string} root */
function mergeInProgress(root) {
	try {
		git(root, ["rev-parse", "-q", "--verify", "MERGE_HEAD"]);
		return true;
	} catch {
		return false;
	}
}

/**
 * commit-msg half: bump and stage every affected package's version.
 * @param {string} root @param {string} messageFile
 * @returns {{ type: BumpType | null, bumped: { path: string, from: string, to: string }[] }}
 */
export function bumpStaged(root, messageFile) {
	if (mergeInProgress(root)) return { type: null, bumped: [] };
	const message = readFileSync(messageFile, "utf8").trim();
	if (/^(fixup|squash|amend)! /.test(message)) return { type: null, bumped: [] };
	const type = bumpTypeOf(message);
	if (type === null) return { type: null, bumped: [] };
	/** @type {Map<string, Pkg>} */
	const pkgs = new Map();
	for (const f of stagedFiles(root)) {
		const p = nearestPackage(root, f);
		if (p !== null && !pkgs.has(p.file)) pkgs.set(p.file, p);
	}
	const bumped = [];
	for (const p of pkgs.values()) {
		const to = bumpVersion(p.version, type);
		// Only the version value is replaced: re-stringifying would lose the file's formatting.
		const text = readFileSync(p.file, "utf8").replace(/("version"\s*:\s*)"[^"]*"/, `$1"${to}"`);
		writeFileSync(p.file, text);
		const rel = relative(root, p.file);
		git(root, ["add", "--", rel]);
		bumped.push({ path: rel, from: p.version, to });
	}
	if (bumped.length > 0) {
		writeFileSync(markerPath(root), JSON.stringify(bumped.map((b) => b.path)));
	}
	return { type, bumped };
}

/**
 * post-commit half: fold the staged bump into the commit just made.
 * @param {string} root @returns {{ folded: boolean, reason: string }}
 */
export function foldBump(root) {
	const marker = markerPath(root);
	if (!existsSync(marker)) return { folded: false, reason: "no bump pending" };
	/** @type {unknown} */
	const parsed = JSON.parse(readFileSync(marker, "utf8"));
	unlinkSync(marker);
	const pending = new Set(Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : []);
	const staged = stagedFiles(root);
	if (staged.length === 0) return { folded: false, reason: "the bump is already in the commit" };
	if (!staged.every((f) => pending.has(f))) {
		return {
			folded: false,
			reason: "the bump is staged alongside other changes; include it in the next commit",
		};
	}
	const parents = git(root, ["rev-list", "--parents", "-n", "1", "HEAD"]).trim().split(/\s+/);
	if (parents.length > 2) return { folded: false, reason: "HEAD is a merge commit" };
	// The hooks already ran for this commit; the amend adds only the version files.
	git(root, ["commit", "--amend", "--no-edit", "--no-verify"]);
	return { folded: true, reason: "version bump folded into the commit" };
}

const isMain =
	process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename);
if (isMain) {
	const root = git(process.cwd(), ["rev-parse", "--show-toplevel"]).trim();
	const arg = process.argv[2];
	if (arg === "--post-commit") {
		const r = foldBump(root);
		if (r.reason !== "no bump pending") process.stdout.write(`version bump: ${r.reason}\n`);
	} else if (arg !== undefined) {
		const r = bumpStaged(root, arg);
		for (const b of r.bumped)
			process.stdout.write(`version bump: ${b.path} ${b.from} -> ${b.to}\n`);
	} else {
		process.stderr.write("usage: version-bump.mjs <message file> | --post-commit\n");
		process.exit(2);
	}
}
