#!/usr/bin/env node
// Installs the SEB bundle estate/platform.lock names into <repo>/.seb-bundle/, wherever the
// estate's code runs: a developer checkout (.pnpmfile.cjs, scripts/postinstall.mjs) and CI
// (.github/actions/seb-bundle).
//
//   node estate/seb-bundle-install.mjs [--repo <root>] [--archive <oci archive>]
//
// --archive installs a LOCAL build of the locked bundle (SEB's build.mjs --dry-run --archive)
// instead of pulling it: only when the archive holds the manifest the lock names, by digest,
// checked exactly as a pulled one (lib/oci-archive.mjs). Without the estate's Harbor at hand,
// that is how a bundle is tried before it is published.
//
// No lock, or a lock with no digest yet: nothing to install, said, exit 0 — unless a dependency
// already takes a SEB library from .seb-bundle/, which is then REFUSED by name.
// Up to date (.seb-bundle/.installed names the lock's digest): nothing is fetched.
// Otherwise the bundle is pulled BY DIGEST in Node (lib/oci-pull.mjs), every artefact checked
// against bundle.json (lib/bundle-check.mjs), staged, and only then swapped in, so a failed
// install never leaves a half-written .seb-bundle/, and made READ-ONLY (lib/read-only.mjs). Failure: `SEB BUNDLE NOT INSTALLED: <why>`.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBundle } from "./lib/bundle-check.mjs";
import { parseLock } from "./lib/lock.mjs";
import { layerFromArchive } from "./lib/oci-archive.mjs";
import { pullLayer } from "./lib/oci-pull.mjs";
import { sealTree, unsealTree } from "./lib/read-only.mjs";

const STAMP = ".installed";

/** @param {string} repo @returns {boolean} */
function takesLibrariesFromBundle(repo) {
	for (const f of ["pnpm-lock.yaml", "package.json"]) {
		const p = join(repo, f);
		if (existsSync(p) && readFileSync(p, "utf8").includes(".seb-bundle/libs/")) return true;
	}
	return false;
}

/**
 * @param {string} repo
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [archive] a local OCI archive of the locked bundle, instead of a pull
 * @returns {Promise<{ code: 0 | 1, message: string }>}
 */
export async function install(repo, env = process.env, archive = undefined) {
	const lockFile = join(repo, "estate", "platform.lock");
	const needed = takesLibrariesFromBundle(repo);
	if (!existsSync(lockFile))
		return needed
			? { code: 1, message: "SEB BUNDLE NOT INSTALLED: no estate/platform.lock" }
			: { code: 0, message: "SEB bundle: no estate/platform.lock, nothing to install" };
	let lock;
	try {
		lock = parseLock(readFileSync(lockFile, "utf8"));
	} catch (e) {
		return {
			code: 1,
			message: `SEB BUNDLE NOT INSTALLED: ${e instanceof Error ? e.message : String(e)}`,
		};
	}
	if (lock.digest === "" && archive !== undefined)
		return {
			code: 1,
			message: `SEB BUNDLE NOT INSTALLED: ${archive}: estate/platform.lock names no digest, so no archive can be the locked bundle`,
		};
	if (lock.digest === "")
		return needed
			? {
					code: 1,
					message: `SEB BUNDLE NOT INSTALLED: a dependency takes a SEB library from .seb-bundle/, but estate/platform.lock names no digest for SEB ${lock.version} yet`,
				}
			: {
					code: 0,
					message: `SEB bundle: SEB ${lock.version} has no digest in estate/platform.lock yet (the estate's Harbor holds no bundle); nothing to install`,
				};
	const dest = join(repo, ".seb-bundle");
	const stamp = join(dest, STAMP);
	if (
		archive === undefined &&
		existsSync(stamp) &&
		readFileSync(stamp, "utf8").trim() === lock.digest
	)
		return { code: 0, message: `SEB bundle: .seb-bundle/ already holds ${lock.digest}` };

	const staging = join(repo, ".seb-bundle.staging");
	unsealTree(staging);
	rmSync(staging, { recursive: true, force: true });
	mkdirSync(staging, { recursive: true });
	const at = lock.source.slice("oci://".length);
	const host = at.slice(0, at.indexOf("/"));
	const repository = at.slice(at.indexOf("/") + 1);
	const ref = `${at}@${lock.digest}`;
	try {
		const tarFile = join(staging, ".bundle.tar");
		if (archive === undefined)
			await pullLayer({ host, repository, digest: lock.digest, out: tarFile, env });
		else layerFromArchive({ archive, digest: lock.digest, out: tarFile });
		const x = spawnSync("tar", ["-xf", tarFile, "-C", staging], { encoding: "utf8" });
		rmSync(tarFile, { force: true });
		if (x.status !== 0) throw new Error(`extracting ${ref}: ${(x.stderr ?? "").trim()}`);
		const checked = checkBundle(staging, ref, lock.version);
		writeFileSync(join(staging, STAMP), `${lock.digest}\n`);
		unsealTree(dest);
		rmSync(dest, { recursive: true, force: true });
		renameSync(staging, dest);
		// Read-only from here on (lib/read-only.mjs): SEB's code is never edited in an estate.
		sealTree(dest);
		return {
			code: 0,
			message: `SEB bundle: installed ${lock.source}@${lock.digest} (${lock.version})${archive === undefined ? "" : ` from ${archive}`}: ${checked.length} artefact(s)`,
		};
	} catch (e) {
		rmSync(staging, { recursive: true, force: true });
		return {
			code: 1,
			message: `SEB BUNDLE NOT INSTALLED: ${ref}: ${e instanceof Error ? e.message : String(e)}`,
		};
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const i = process.argv.indexOf("--repo");
	const repo = resolve(
		i > 0 ? (process.argv[i + 1] ?? "") : join(fileURLToPath(import.meta.url), "../.."),
	);
	const a = process.argv.indexOf("--archive");
	const archive = a > 0 ? resolve(process.argv[a + 1] ?? "") : undefined;
	const r = await install(repo, process.env, archive);
	(r.code === 0 ? process.stdout : process.stderr).write(`${r.message}\n`);
	process.exit(r.code);
}
