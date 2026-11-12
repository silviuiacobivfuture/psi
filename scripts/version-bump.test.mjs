// scripts/version-bump.mjs against real git repositories in a temporary directory.
//   node --test scripts/version-bump.test.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { bumpStaged, bumpTypeOf, bumpVersion, foldBump, nearestPackage } from "./version-bump.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const made = [];
after(() => {
	for (const d of made) rmSync(d, { recursive: true, force: true });
});

/** @param {string} cwd @param {string[]} args */
const git = (cwd, args) =>
	execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/** A repository with a root package (0.0.1, never bumped) and two apps. */
function repo() {
	const root = mkdtempSync(join(tmpdir(), "version-bump-"));
	made.push(root);
	git(root, ["init", "-q", "-b", "dev"]);
	git(root, ["config", "user.email", "t@example.invalid"]);
	git(root, ["config", "user.name", "t"]);
	const write = (/** @type {string} */ p, /** @type {string} */ s) => {
		mkdirSync(dirname(join(root, p)), { recursive: true });
		writeFileSync(join(root, p), s);
	};
	write("package.json", '{\n\t"name": "root",\n\t"version": "0.0.1"\n}\n');
	write(
		"apps/a/package.json",
		'{\n\t"name": "@t/a",\n\t"version": "0.1.0",\n\t"private": true\n}\n',
	);
	write("apps/a/src/x.ts", "export const x = 1;\n");
	write("apps/b/package.json", '{\n\t"name": "@t/b",\n\t"version": "1.2.3"\n}\n');
	write("apps/b/src/y.ts", "export const y = 1;\n");
	write("apps/z/package.json", '{\n\t"name": "@t/z",\n\t"version": "0.0.0"\n}\n');
	write("apps/z/src/z.ts", "export const z = 1;\n");
	git(root, ["add", "."]);
	git(root, ["commit", "-q", "-m", "init"]);
	return { root, write };
}

const version = (/** @type {string} */ root, /** @type {string} */ app) =>
	JSON.parse(readFileSync(join(root, "apps", app, "package.json"), "utf8")).version;
const staged = (/** @type {string} */ root) =>
	git(root, ["diff", "--cached", "--name-only"]).split("\n").filter(Boolean);
function message(/** @type {string} */ root, /** @type {string} */ text) {
	const f = join(root, ".git", "MSG");
	writeFileSync(f, text);
	return f;
}

describe("bumpTypeOf", () => {
	for (const [msg, want] of [
		["fix: a [PATCH]", "patch"],
		["feat: a [UPDATE]", "minor"],
		["feat!: a [RELEASE]", "major"],
		["feat: a [UPDATE] [RELEASE]", "major"],
		["fix: a", null],
		["fix: a [patch]", null],
	]) {
		test(`${msg} -> ${want}`, () => assert.equal(bumpTypeOf(msg), want));
	}
});

describe("bumpVersion", () => {
	for (const [from, type, want] of [
		["0.1.0", "patch", "0.1.1"],
		["0.1.9", "minor", "0.2.0"],
		["1.2.3", "major", "2.0.0"],
		["v1.2.3", "patch", "1.2.4"],
		["2", "minor", "2.1.0"],
	]) {
		test(`${from} ${type} -> ${want}`, () => assert.equal(bumpVersion(from, type), want));
	}
});

describe("nearestPackage", () => {
	test("finds the app above a nested file", () => {
		const { root } = repo();
		assert.equal(nearestPackage(root, "apps/a/src/x.ts")?.version, "0.1.0");
	});
	test("never the root package", () => {
		const { root } = repo();
		assert.equal(nearestPackage(root, "scripts/s.mjs"), null);
	});
	test("skips a 0.0.0 package", () => {
		const { root } = repo();
		assert.equal(nearestPackage(root, "apps/z/src/z.ts"), null);
	});
});

describe("bumpStaged (commit-msg half)", () => {
	test("bumps and stages every affected package, keeping the file's formatting", () => {
		const { root, write } = repo();
		write("apps/a/src/x.ts", "export const x = 2;\n");
		write("apps/b/src/y.ts", "export const y = 2;\n");
		git(root, ["add", "apps"]);
		const r = bumpStaged(root, message(root, "feat: two apps [UPDATE]"));
		assert.deepEqual(r.bumped.map((b) => [b.path, b.to]).sort(), [
			["apps/a/package.json", "0.2.0"],
			["apps/b/package.json", "1.3.0"],
		]);
		assert.equal(
			readFileSync(join(root, "apps/a/package.json"), "utf8"),
			'{\n\t"name": "@t/a",\n\t"version": "0.2.0",\n\t"private": true\n}\n',
		);
		assert.ok(staged(root).includes("apps/a/package.json"));
		assert.ok(staged(root).includes("apps/b/package.json"));
	});
	test("an untouched package is not bumped", () => {
		const { root, write } = repo();
		write("apps/a/src/x.ts", "export const x = 3;\n");
		git(root, ["add", "apps/a"]);
		bumpStaged(root, message(root, "fix: a [PATCH]"));
		assert.equal(version(root, "a"), "0.1.1");
		assert.equal(version(root, "b"), "1.2.3");
	});
	for (const [why, text] of [
		["no tag", "fix: a"],
		["a fixup", "fixup! fix: a [PATCH]"],
		["a squash", "squash! fix: a [PATCH]"],
	]) {
		test(`${why}: nothing changes`, () => {
			const { root, write } = repo();
			write("apps/a/src/x.ts", "export const x = 4;\n");
			git(root, ["add", "apps/a"]);
			const r = bumpStaged(root, message(root, text));
			assert.deepEqual(r.bumped, []);
			assert.equal(version(root, "a"), "0.1.0");
			assert.deepEqual(staged(root), ["apps/a/src/x.ts"]);
		});
	}
	test("only root-level files: nothing bumped, no marker", () => {
		const { root, write } = repo();
		write("README.md", "x\n");
		git(root, ["add", "README.md"]);
		assert.deepEqual(bumpStaged(root, message(root, "docs: x [PATCH]")).bumped, []);
		assert.deepEqual(foldBump(root), { folded: false, reason: "no bump pending" });
	});
});

describe("foldBump (post-commit half)", () => {
	test("folds exactly the version files into the commit", () => {
		const { root, write } = repo();
		write("apps/a/src/x.ts", "export const x = 5;\n");
		git(root, ["add", "apps/a"]);
		bumpStaged(root, message(root, "fix: a [PATCH]"));
		git(root, ["restore", "--staged", "apps/a/package.json"]);
		git(root, ["commit", "-q", "-m", "fix: a [PATCH]"]);
		git(root, ["add", "apps/a/package.json"]);
		const head = git(root, ["rev-parse", "HEAD"]);
		assert.equal(foldBump(root).folded, true);
		assert.notEqual(git(root, ["rev-parse", "HEAD"]), head);
		assert.match(git(root, ["show", "--name-only", "--format=", "HEAD"]), /apps\/a\/package\.json/);
		assert.deepEqual(staged(root), []);
		assert.equal(git(root, ["rev-list", "--count", "HEAD"]).trim(), "2");
	});
	test("refuses to fold when anything else is staged, and changes nothing", () => {
		const { root, write } = repo();
		write("apps/a/src/x.ts", "export const x = 6;\n");
		git(root, ["add", "apps/a"]);
		bumpStaged(root, message(root, "fix: a [PATCH]"));
		git(root, ["restore", "--staged", "apps/a/package.json"]);
		git(root, ["commit", "-q", "-m", "fix: a [PATCH]"]);
		write("apps/b/src/y.ts", "export const y = 9;\n");
		git(root, ["add", "apps/a/package.json", "apps/b/src/y.ts"]);
		const head = git(root, ["rev-parse", "HEAD"]);
		assert.equal(foldBump(root).folded, false);
		assert.equal(git(root, ["rev-parse", "HEAD"]), head);
		assert.deepEqual(staged(root).sort(), ["apps/a/package.json", "apps/b/src/y.ts"]);
	});
});

describe("through the real hooks", () => {
	test("a tagged commit carries its bump; an untagged one is refused", () => {
		const { root, write } = repo();
		mkdirSync(join(root, "scripts"));
		for (const f of ["commit-msg.mjs", "version-bump.mjs"]) {
			writeFileSync(join(root, "scripts", f), readFileSync(join(here, f)));
		}
		const hooks = join(root, ".husky");
		mkdirSync(hooks);
		writeFileSync(
			join(hooks, "commit-msg"),
			readFileSync(join(here, "..", ".husky", "commit-msg")),
		);
		writeFileSync(
			join(hooks, "post-commit"),
			readFileSync(join(here, "..", ".husky", "post-commit")),
		);
		chmodSync(join(hooks, "commit-msg"), 0o755);
		chmodSync(join(hooks, "post-commit"), 0o755);
		git(root, ["config", "core.hooksPath", ".husky"]);
		write("apps/b/src/y.ts", "export const y = 7;\n");
		git(root, ["add", "apps/b/src/y.ts"]);
		assert.throws(() => git(root, ["commit", "-q", "-m", "fix(b): y"]));
		assert.equal(version(root, "b"), "1.2.3");
		git(root, ["commit", "-q", "-m", "fix(b): y [PATCH]"]);
		assert.equal(version(root, "b"), "1.2.4");
		assert.deepEqual(
			git(root, ["show", "--name-only", "--format=", "HEAD"]).split("\n").filter(Boolean).sort(),
			["apps/b/package.json", "apps/b/src/y.ts"],
		);
		assert.deepEqual(staged(root), []);
	});
});
