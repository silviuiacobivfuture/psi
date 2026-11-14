// scripts/lock-slice.mjs, and affected-apps.mjs --since-deployed over a lockfile change, against a small
// temporary repository.
//   node --test scripts/lock-slice.test.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseLock, slice, sliceChanged } from "./lock-slice.mjs";

const script = join(dirname(fileURLToPath(import.meta.url)), "affected-apps.mjs");

/** A v9 lockfile: site → ui (workspace) → hono; api → zod → tiny; both share hono. */
const lock = ({
	siteExtra = "",
	zod = "3.25.76",
	tiny = "1.0.0",
	header = "",
	version = "9.0",
} = {}) =>
	`lockfileVersion: '${version}'

settings:
  autoInstallPeers: true
${header}
importers:

  .:
    devDependencies:
      nx:
        specifier: 22.0.2
        version: 22.0.2

  apps/api:
    dependencies:
      hono:
        specifier: ^4
        version: 4.13.18
      zod:
        specifier: ^3
        version: ${zod}

  apps/site:
    dependencies:
      '@x/ui':
        specifier: workspace:*
        version: link:../../packages/ui
${siteExtra}
  packages/ui:
    dependencies:
      hono:
        specifier: ^4
        version: 4.13.18

packages:

  hono@4.13.18:
    resolution: {integrity: sha512-hono}

  nx@22.0.2:
    resolution: {integrity: sha512-nx}

  tiny@${tiny}:
    resolution: {integrity: sha512-tiny${tiny}}

  zod@${zod}:
    resolution: {integrity: sha512-zod${zod}}

snapshots:

  hono@4.13.18: {}

  nx@22.0.2: {}

  tiny@${tiny}: {}

  zod@${zod}(tiny@${tiny}):
    dependencies:
      tiny: ${tiny}
`.replace(`version: ${zod}\n\n  apps/site`, `version: ${zod}(tiny@${tiny})\n\n  apps/site`);

const link = (name, path) =>
	`      '${name}':\n        specifier: workspace:*\n        version: link:${path}\n`;

describe("the lockfile slice an image installs", () => {
	test("reads importers, packages and snapshots", () => {
		const l = parseLock(lock());
		assert.ok(l);
		assert.deepEqual([...l.importers.keys()], [".", "apps/api", "apps/site", "packages/ui"]);
		assert.ok(l.snapshots.has("zod@3.25.76(tiny@1.0.0)"));
		assert.ok(l.packages.has("zod@3.25.76"));
	});
	test("another importer's change leaves the slice as it was", () => {
		const changed = lock({ siteExtra: link("@x/other", "../../packages/other") });
		assert.equal(sliceChanged(lock(), changed, ["apps/api"]), false);
		assert.equal(sliceChanged(lock(), changed, ["apps/site", "packages/ui"]), true);
	});
	test("a transitive dependency's change reaches the importer that resolves to it", () => {
		const changed = lock({ tiny: "1.0.1" });
		assert.equal(sliceChanged(lock(), changed, ["apps/api"]), true);
		assert.equal(sliceChanged(lock(), changed, ["apps/site", "packages/ui"]), false);
	});
	test("a header change reaches every importer", () => {
		const changed = lock({ header: "overrides:\n  hono: 4.13.19\n" });
		assert.equal(sliceChanged(lock(), changed, ["apps/site"]), true);
		assert.equal(sliceChanged(lock(), changed, ["apps/api"]), true);
	});
	test("the root importer is always in the slice", () => {
		const changed = lock().replace(
			"version: 22.0.2\n\n  apps/api",
			"version: 22.0.3\n\n  apps/api",
		);
		assert.equal(sliceChanged(lock(), changed, ["apps/api"]), true);
	});
	test("an importer missing on one side counts as changed", () => {
		assert.equal(sliceChanged(lock(), lock(), ["apps/nowhere"]), false);
		const withIt = lock({ siteExtra: "" }).replace(
			"  packages/ui:",
			"  apps/nowhere: {}\n\n  packages/ui:",
		);
		assert.equal(sliceChanged(lock(), withIt, ["apps/nowhere"]), true);
	});
	test("refuses (affected) what it cannot read: another lockfile version, empty text", () => {
		assert.equal(parseLock(lock({ version: "6.0" })), null);
		assert.equal(sliceChanged(lock(), lock({ version: "6.0" }), ["apps/api"]), true);
		assert.equal(sliceChanged("", lock(), ["apps/api"]), true);
	});
	test("refuses (affected) a dependency that resolves to no snapshot", () => {
		const broken = lock().replace("  hono@4.13.18: {}\n", "");
		const l = parseLock(broken);
		assert.ok(l);
		assert.equal(slice(l, ["packages/ui"]), null);
		assert.equal(sliceChanged(lock(), broken, ["packages/ui"]), true);
	});
});

describe("--since-deployed over a lockfile change", () => {
	const repo = mkdtempSync(join(tmpdir(), "lockslice-"));
	after(() => rmSync(repo, { recursive: true, force: true }));
	const put = (path, text) => {
		mkdirSync(dirname(join(repo, path)), { recursive: true });
		writeFileSync(join(repo, path), text);
	};
	const git = (...args) =>
		execFileSync("git", args, {
			cwd: repo,
			env: {
				...process.env,
				GIT_AUTHOR_NAME: "t",
				GIT_AUTHOR_EMAIL: "t@t",
				GIT_COMMITTER_NAME: "t",
				GIT_COMMITTER_EMAIL: "t@t",
			},
		})
			.toString()
			.trim();
	const commit = (m) => {
		git("add", "-A");
		git("commit", "-q", "--no-verify", "-m", m);
		return git("rev-parse", "--short=7", "HEAD");
	};
	const deployAll = (tag) => {
		for (const app of ["api", "site", "convex", "whole"])
			put(
				`gitops/services/${app}/overlays/dev/kustomization.yaml`,
				`images:\n  - name: r/${app}\n    newTag: "${tag}"\n`,
			);
		commit(`deploy ${tag}`);
	};
	const stale = () =>
		execFileSync(process.execPath, [script, "--since-deployed", "dev"], { cwd: repo })
			.toString()
			.split("\n")
			.filter(Boolean);

	git("init", "-q");
	put("packages/ui/package.json", JSON.stringify({ name: "@x/ui" }));
	put("apps/api/package.json", JSON.stringify({ name: "@x/api" }));
	put(
		"apps/api/Dockerfile",
		'FROM node\nCOPY . .\nRUN pnpm install --frozen-lockfile --filter "@x/api..."\n',
	);
	put(
		"apps/site/package.json",
		JSON.stringify({ name: "@x/site", dependencies: { "@x/ui": "workspace:*" } }),
	);
	put(
		"apps/site/Dockerfile",
		'FROM node\nCOPY . .\nRUN pnpm install --frozen-lockfile --filter "@x/site..."\n',
	);
	// Runs no pnpm at all: no lockfile change can reach its image.
	put("apps/convex/Dockerfile", "FROM convex\nCOPY apps/convex /c\n");
	// Installs the whole workspace: any lockfile change reaches it.
	put("apps/whole/Dockerfile", "FROM node\nCOPY . .\nRUN pnpm install --frozen-lockfile\n");
	put("pnpm-lock.yaml", lock());
	deployAll(commit("first"));

	test("one importer's change rebuilds only the apps that install it (and the unfiltered one)", () => {
		put("pnpm-lock.yaml", lock({ siteExtra: link("@x/new", "../../packages/new") }));
		commit("site links a package");
		assert.deepEqual(stale(), ["site", "whole"]);
	});
	test("a transitive change rebuilds the app resolving to it, never the image without pnpm", () => {
		deployAll(git("rev-parse", "--short=7", "HEAD"));
		put("pnpm-lock.yaml", lock({ tiny: "1.0.1", siteExtra: link("@x/new", "../../packages/new") }));
		commit("tiny 1.0.1");
		assert.deepEqual(stale(), ["api", "whole"]);
	});
	test("an unreadable lockfile rebuilds every app that installs", () => {
		deployAll(git("rev-parse", "--short=7", "HEAD"));
		put("pnpm-lock.yaml", lock({ version: "6.0" }));
		commit("old format");
		assert.deepEqual(stale(), ["api", "site", "whole"]);
	});
	test("without both lockfiles (a plain diff on stdin) the lockfile still rebuilds everything", () => {
		const out = execFileSync(process.execPath, [script], { cwd: repo, input: "pnpm-lock.yaml\n" })
			.toString()
			.split("\n")
			.filter(Boolean);
		assert.deepEqual(out, ["api", "convex", "site", "whole"]);
	});
});
