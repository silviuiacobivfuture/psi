#!/usr/bin/env node
// Node mirror of seb-root.sh — THE ONE ENTRY POINT from the estate to SEB's tools. Same order:
// $SEB_ROOT, else <repo>/.seb-bundle (with a bundle.json); neither → exit 1.
//
//   node estate/seb-root.mjs <repo root>    prints the SEB root
//   import { sebRoot } from "…/seb-root.mjs"
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** @param {string} repo @param {NodeJS.ProcessEnv} [env] @returns {string} */
export function sebRoot(repo, env = process.env) {
	const fromEnv = env.SEB_ROOT;
	if (fromEnv) {
		if (!existsSync(fromEnv) || !statSync(fromEnv).isDirectory())
			throw new Error(`seb_root: SEB_ROOT=${fromEnv} is not a directory`);
		return fromEnv;
	}
	const bundle = join(repo, ".seb-bundle");
	if (existsSync(join(bundle, "bundle.json"))) return bundle;
	throw new Error(
		`seb_root: no SEB tree for ${repo} — set SEB_ROOT, or install the locked bundle (estate/platform.lock)`,
	);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const repo = process.argv[2];
	if (!repo) {
		process.stderr.write("usage: seb-root.mjs <repo root>\n");
		process.exit(2);
	}
	try {
		process.stdout.write(`${sebRoot(repo)}\n`);
	} catch (e) {
		process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
		process.exit(1);
	}
}
