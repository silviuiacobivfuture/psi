// The SEB bundle BEFORE pnpm fetches anything.
//
// SEB's built libraries come from the installed bundle (file:.seb-bundle/libs/npm/*.tgz), so
// .seb-bundle/ must hold the bundle estate/platform.lock names before pnpm opens those tarballs.
// A root `preinstall` is too late: pnpm 10 fetches every dependency, file: tarballs included,
// before it runs any lifecycle script. The preResolution hook runs before the fetch, frozen
// lockfile and --offline included, so it is where the installer runs.
//
// Up to date (the bundle's stamp names the lock's digest): nothing is fetched, no network.
// Stale or missing: estate/seb-bundle-install.mjs pulls the locked digest and swaps it in.
// The lock takes libraries from it and it cannot be installed: the install is REFUSED by name.

const { spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { join } = require("node:path");

const INSTALLER = join("estate", "seb-bundle-install.mjs");

/** @param {string} repo @returns {void} */
function installSebBundle(repo) {
	// An image build context without the installer carries the bundle it was given.
	if (!existsSync(join(repo, INSTALLER))) return;
	const r = spawnSync(process.execPath, [join(repo, INSTALLER), "--repo", repo], {
		encoding: "utf8",
	});
	const said = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
	if (said !== "") console.log(said);
	if (r.error) throw new Error(`SEB BUNDLE NOT INSTALLED: ${r.error.message}`);
	if (r.status !== 0) throw new Error(said || "SEB BUNDLE NOT INSTALLED");
}

module.exports = {
	hooks: {
		preResolution() {
			installSebBundle(__dirname);
		},
	},
};
