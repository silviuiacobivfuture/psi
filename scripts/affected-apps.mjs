#!/usr/bin/env node
// The deployable apps a change affects, for .github/workflows/apps.yml's plan step.
//
//   git diff --name-only <before> <after> | node scripts/affected-apps.mjs
//
// An app is deployable when apps/<app>/Dockerfile exists. It is affected when a changed file is
// inside it, or inside a workspace package it depends on (directly or through other workspace
// packages: package.json dependencies/devDependencies with the workspace: protocol), or inside a
// packages/<x> folder its Dockerfile names (an app without a package.json, e.g. the Convex deploy
// image copying packages/scheduling). A change to a file every image installs from
// (pnpm-lock.yaml, pnpm-workspace.yaml, the root package.json, .npmrc, estate/platform.lock,
// deploy/, .pnpmfile.cjs) affects every app. Prints one app per line; nothing when none.
//
//   node scripts/affected-apps.mjs --since-deployed <env>
//
// The apps whose image on <env> is behind HEAD (staleApps below): what the plan builds.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const EVERYTHING = [
	/^pnpm-lock\.yaml$/,
	/^pnpm-workspace\.yaml$/,
	/^package\.json$/,
	/^\.npmrc$/,
	/^\.pnpmfile\.cjs$/,
	/^estate\/platform\.lock$/,
	/^deploy\//,
];

/** @returns {Map<string, { dir: string, deps: string[] }>} workspace packages by name */
function workspace() {
	const out = new Map();
	for (const top of ["apps", "packages", "tools"]) {
		if (!existsSync(join(ROOT, top))) continue;
		for (const d of readdirSync(join(ROOT, top), { withFileTypes: true })) {
			if (!d.isDirectory()) continue;
			const pj = join(ROOT, top, d.name, "package.json");
			if (!existsSync(pj)) continue;
			const json = JSON.parse(readFileSync(pj, "utf8"));
			const all = { ...(json.dependencies ?? {}), ...(json.devDependencies ?? {}) };
			const deps = Object.entries(all)
				.filter(([, v]) => typeof v === "string" && v.startsWith("workspace:"))
				.map(([k]) => k);
			out.set(json.name, { dir: `${top}/${d.name}/`, deps });
		}
	}
	return out;
}

/** @param {string[]} changed @returns {string[]} */
export function affectedApps(changed) {
	const apps = readdirSync(join(ROOT, "apps"), { withFileTypes: true })
		.filter((d) => d.isDirectory() && existsSync(join(ROOT, "apps", d.name, "Dockerfile")))
		.map((d) => d.name);
	if (changed.some((f) => EVERYTHING.some((re) => re.test(f)))) return apps.sort();
	const ws = workspace();
	const dirOf = new Map([...ws].map(([name, p]) => [name, p.dir]));
	/** @param {string} name @param {Set<string>} seen @returns {Set<string>} folders it builds from */
	const closure = (name, seen = new Set()) => {
		if (seen.has(name)) return seen;
		seen.add(name);
		for (const d of ws.get(name)?.deps ?? []) closure(d, seen);
		return seen;
	};
	const hit = [];
	for (const app of apps) {
		const dirs = new Set([`apps/${app}/`]);
		const pj = join(ROOT, "apps", app, "package.json");
		if (existsSync(pj)) {
			const name = JSON.parse(readFileSync(pj, "utf8")).name;
			for (const n of closure(name)) {
				const dir = dirOf.get(n);
				if (dir !== undefined) dirs.add(dir);
			}
		}
		const docker = readFileSync(join(ROOT, "apps", app, "Dockerfile"), "utf8");
		for (const m of docker.matchAll(/packages\/([a-z0-9-]+)/g)) dirs.add(`packages/${m[1]}/`);
		if (changed.some((f) => [...dirs].some((d) => f.startsWith(d)))) hit.push(app);
	}
	return hit.sort();
}

const TAG = /^\s*newTag:\s*"?([^"\s#]+)"?/m;

/**
 * The apps whose deployed image is behind the checkout: for each, the commit its tag in
 * gitops/services/<app>/overlays/<env>/kustomization.yaml was built from, diffed against HEAD. A push's
 * own diff is not enough: GitHub keeps one pending run per group and drops the one before it, so a
 * change that landed in a dropped run is in no later push's diff, and its image is never built (the
 * Convex functions of 2026-11-14 stayed at 7e052ef while the API that needed them was rebuilt). An app
 * whose tag is missing or names no commit here counts as behind.
 * @param {string} env @returns {string[]}
 */
export function staleApps(env) {
	const apps = readdirSync(join(ROOT, "apps"), { withFileTypes: true })
		.filter((d) => d.isDirectory() && existsSync(join(ROOT, "apps", d.name, "Dockerfile")))
		.map((d) => d.name);
	const git = (...args) =>
		execFileSync("git", args, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString();
	const diffs = new Map();
	const stale = [];
	for (const app of apps) {
		const overlay = join(ROOT, "gitops/services", app, "overlays", env, "kustomization.yaml");
		const tag = existsSync(overlay) ? TAG.exec(readFileSync(overlay, "utf8"))?.[1] : undefined;
		let changed;
		try {
			if (tag === undefined || !/^[0-9a-f]{7,40}$/.test(tag)) throw new Error("no commit");
			git("cat-file", "-e", `${tag}^{commit}`);
			if (!diffs.has(tag))
				diffs.set(tag, git("diff", "--name-only", tag, "HEAD").split("\n").filter(Boolean));
			changed = diffs.get(tag);
		} catch {
			stale.push(app);
			continue;
		}
		if (affectedApps(changed).includes(app)) stale.push(app);
	}
	return stale.sort();
}

if (import.meta.url === `file://${process.argv[1]}`) {
	if (process.argv[2] === "--since-deployed") {
		for (const a of staleApps(process.argv[3] ?? "dev")) console.log(a);
		process.exit(0);
	}
	const input = readFileSync(0, "utf8")
		.split("\n")
		.map((s) => s.trim())
		.filter(Boolean);
	for (const a of affectedApps(input)) console.log(a);
}
