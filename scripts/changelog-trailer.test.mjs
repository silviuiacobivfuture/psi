// The changelog rule (.husky/commit-msg → scripts/changelog-trailer.mjs), through `git commit` in
// real repositories in a temporary directory: every refusal leaves HEAD where it was and the
// staged files staged; every acceptance records exactly one commit.
//   node --test scripts/changelog-trailer.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseDeclaration } from "./changelog-rules.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const made = [];
after(() => {
	for (const d of made) rmSync(d, { recursive: true, force: true });
});

const ID = "cmhv2k8qz0001abcd1234efgh";
const ID2 = "cmhv2k8qz0002abcd1234efgh";

/** @param {string} cwd @param {string[]} args @param {Record<string, string>} [env] */
const git = (cwd, args, env = {}) => {
	const r = spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...env } });
	return { status: r.status, out: r.stdout, err: r.stderr };
};

/**
 * apps/tracked (a tenant), apps/quiet ("none"), apps/fresh (undeclared), packages/lib.
 * @param {unknown} [declaration]
 */
function repo(declaration) {
	const root = mkdtempSync(join(tmpdir(), "changelog-trailer-"));
	made.push(root);
	git(root, ["init", "-q", "-b", "dev"]);
	git(root, ["config", "user.email", "dev@example.invalid"]);
	git(root, ["config", "user.name", "dev"]);
	const write = (/** @type {string} */ p, /** @type {string} */ s) => {
		mkdirSync(dirname(join(root, p)), { recursive: true });
		writeFileSync(join(root, p), s);
	};
	mkdirSync(join(root, "scripts"));
	// Every script the estate's own .husky/commit-msg may call (the message rule, a version bump…).
	for (const f of readdirSync(here).filter((n) => n.endsWith(".mjs") && !n.endsWith(".test.mjs")))
		copyFileSync(join(here, f), join(root, "scripts", f));
	mkdirSync(join(root, ".husky"));
	copyFileSync(join(here, "../.husky/commit-msg"), join(root, ".husky/commit-msg"));
	chmodSync(join(root, ".husky/commit-msg"), 0o755);
	write(
		"changelog.json",
		JSON.stringify(
			declaration ?? {
				apps: {
					tracked: { tenant: "tracked", language: "ro" },
					quiet: { none: "a static page with no release notes" },
				},
			},
		),
	);
	for (const a of ["tracked", "quiet", "fresh"])
		write(`apps/${a}/src/x.ts`, "export const x = 1;\n");
	write("packages/lib/src/l.ts", "export const l = 1;\n");
	write("apps/README.md", "apps\n");
	git(root, ["add", "."]);
	git(root, ["commit", "-q", "-m", "init"]);
	git(root, ["config", "core.hooksPath", ".husky"]);
	return root;
}

/**
 * Stages a change under each path, commits with `message`; reports what happened.
 * @param {string} root @param {string[]} paths @param {string} message @param {Record<string, string>} [env]
 */
function commit(root, paths, message, env) {
	for (const p of paths) {
		mkdirSync(dirname(join(root, p)), { recursive: true });
		writeFileSync(join(root, p), `export const changed = ${Math.random()};\n`);
		git(root, ["add", p]);
	}
	const before = git(root, ["rev-parse", "HEAD"]).out.trim();
	const run = spawnSync("git", ["commit", "-q", "-F", "-"], {
		cwd: root,
		input: message,
		encoding: "utf8",
		env: { ...process.env, ...env },
	});
	const head = git(root, ["rev-parse", "HEAD"]).out.trim();
	const staged = git(root, ["diff", "--cached", "--name-only"]).out.split("\n").filter(Boolean);
	return { status: run.status, err: run.stderr, moved: head !== before, staged };
}

const T = "apps/tracked/src/x.ts";
const F = "apps/fresh/src/x.ts";
const Q = "apps/quiet/src/x.ts";
const P = "packages/lib/src/l.ts";

describe("refused — and nothing is committed", () => {
	/** @type {[string, string[], string, RegExp, Record<string, string>?][]} */
	const cases = [
		[
			"feat to a tracked app, no trailer",
			[T],
			"feat(tracked): search [UPDATE]",
			/apps\/tracked carries a Changelog trailer[\s\S]*pnpm changelog --app tracked/,
		],
		[
			"fix to a tracked app, no trailer",
			[T],
			"fix(tracked): totals [PATCH]",
			/apps\/tracked carries/,
		],
		[
			"perf to a tracked app, no trailer",
			[T],
			"perf(tracked): faster list [PATCH]",
			/apps\/tracked carries/,
		],
		[
			"a breaking refactor (!), no trailer",
			[T],
			"refactor(tracked)!: drop the old route [RELEASE]",
			/apps\/tracked carries/,
		],
		[
			"a BREAKING CHANGE footer, no trailer",
			[T],
			"chore(tracked): rename [RELEASE]\n\nBREAKING CHANGE: the route moved",
			/apps\/tracked carries/,
		],
		[
			"an undeclared app, no trailer",
			[F],
			"feat(fresh): first page [UPDATE]",
			/apps\/fresh is not declared in changelog\.json/,
		],
		[
			"a trailer that is no reference",
			[T],
			`feat(tracked): search [UPDATE]\n\nChangelog: soon`,
			/"Changelog: soon" is not a changelog trailer/,
		],
		[
			"none with no reason",
			[T],
			"feat(tracked): search [UPDATE]\n\nChangelog: none",
			/is not a changelog trailer/,
		],
		[
			"none with a reason too short",
			[T],
			"feat(tracked): search [UPDATE]\n\nChangelog: none — meh",
			/is not a changelog trailer/,
		],
		[
			"an app with a bad reference",
			[T],
			"feat(tracked): search [UPDATE]\n\nChangelog: tracked 12345",
			/after the app, an entry id/,
		],
		[
			"a bare id when two apps are touched",
			[T, F],
			`feat: both [UPDATE]\n\nChangelog: ${ID}`,
			/names no app, and the commit touches 2/,
		],
		[
			"one app covered, the other not",
			[T, F],
			`feat: both [UPDATE]\n\nChangelog: tracked ${ID}`,
			/apps\/fresh is not declared/,
		],
		[
			"the trailer is not the last paragraph",
			[T],
			`feat(tracked): search [UPDATE]\n\nChangelog: tracked ${ID}\n\nMore words after it.`,
			/apps\/tracked carries/,
		],
		[
			"an http (not https) URL",
			[T],
			"feat(tracked): search [UPDATE]\n\nChangelog: http://changelog.example/e/1",
			/is not a changelog trailer/,
		],
		[
			"[skip ci] by someone who is not the estate's CI",
			[T],
			"feat(tracked): deploy [skip ci] [UPDATE]",
			/apps\/tracked carries/,
		],
		[
			"a malformed trailer even on a non-business commit",
			[T],
			"docs(tracked): notes [PATCH]\n\nChangelog: later",
			/is not a changelog trailer/,
		],
	];
	for (const [name, paths, message, why, env] of cases) {
		test(name, () => {
			const root = repo();
			const r = commit(root, paths, message, env);
			assert.notEqual(r.status, 0, "the commit is refused");
			assert.match(r.err, /COMMIT REFUSED/);
			assert.match(r.err, why);
			assert.equal(r.moved, false, "HEAD did not move");
			assert.deepEqual(
				r.staged.sort(),
				[...paths].sort(),
				"the change is still staged, uncommitted",
			);
		});
	}

	test("no changelog.json at all", () => {
		const root = repo();
		git(root, ["rm", "-q", "changelog.json"]);
		git(root, ["commit", "-q", "--no-verify", "-m", "chore: drop [PATCH]"]);
		const r = commit(root, [P], "chore(lib): tidy [PATCH]");
		assert.notEqual(r.status, 0);
		assert.match(r.err, /no changelog\.json/);
		assert.equal(r.moved, false);
	});
});

describe("accepted — exactly one commit", () => {
	/** @type {[string, string[], string, Record<string, string>?][]} */
	const cases = [
		["app-qualified entry id", [T], `feat(tracked): search [UPDATE]\n\nChangelog: tracked ${ID}`],
		["bare entry id, one app", [T], `fix(tracked): totals [PATCH]\n\nChangelog: ${ID}`],
		[
			"https URL",
			[T],
			"feat(tracked): search [UPDATE]\n\nChangelog: https://changelog.example/e/1",
		],
		[
			"none — reason, with an em dash",
			[T],
			"fix(tracked): a log line [PATCH]\n\nChangelog: none — nothing a user can see",
		],
		[
			"none - reason, with a hyphen",
			[T],
			"fix(tracked): a log line [PATCH]\n\nChangelog: none - nothing a user can see",
		],
		[
			"app none — reason",
			[T],
			"fix(tracked): a log line [PATCH]\n\nChangelog: tracked none — nothing a user can see",
		],
		[
			"two apps, one trailer each",
			[T, F],
			`feat: both [UPDATE]\n\nChangelog: tracked ${ID}\nChangelog: fresh ${ID2}`,
		],
		[
			"two apps, one none for all",
			[T, F],
			"feat: both [UPDATE]\n\nChangelog: none — an internal rename, nothing shown",
		],
		[
			"trailer among other trailers",
			[T],
			`feat(tracked): search [UPDATE]\n\nRefs: PROJ-12\nChangelog: tracked ${ID}`,
		],
		["an app declared none", [Q], "feat(quiet): a new section [UPDATE]"],
		["a package only", [P], "feat(lib): a helper [UPDATE]"],
		["apps/README.md is no app", ["apps/README.md"], "feat: describe the apps [UPDATE]"],
		["docs to a tracked app", [T], "docs(tracked): readme [PATCH]"],
		["refactor to a tracked app", [T], "refactor(tracked): split a file [PATCH]"],
		[
			"the estate's CI deploy commit",
			[T],
			"ci(tracked): deploy abc1234 to dev [skip ci] [PATCH]",
			{ GIT_AUTHOR_NAME: "estate-ci", GIT_AUTHOR_EMAIL: "estate-ci@users.noreply.github.com" },
		],
		[
			"a business-facing [skip ci] by the estate's CI",
			[T],
			"feat(tracked): pin [skip ci] [UPDATE]",
			{ GIT_AUTHOR_NAME: "estate-ci", GIT_AUTHOR_EMAIL: "estate-ci@users.noreply.github.com" },
		],
		["fixup!", [T], "fixup! feat(tracked): search [UPDATE]"],
		["squash!", [T], "squash! feat(tracked): search [UPDATE]"],
		[
			"a comment line is not the message",
			[T],
			`feat(tracked): search [UPDATE]\n\nChangelog: tracked ${ID}\n# Please enter the commit message`,
		],
	];
	for (const [name, paths, message, env] of cases) {
		test(name, () => {
			const root = repo();
			const r = commit(root, paths, message, env);
			assert.equal(r.status, 0, r.err);
			assert.equal(r.moved, true, "one commit recorded");
			assert.deepEqual(r.staged, [], "nothing left staged");
		});
	}

	test("a merge commit", () => {
		const root = repo();
		git(root, ["checkout", "-q", "-b", "side"]);
		assert.equal(commit(root, [T], `feat(tracked): side [UPDATE]\n\nChangelog: ${ID}`).status, 0);
		git(root, ["checkout", "-q", "dev"]);
		assert.equal(commit(root, [P], "fix(lib): main [PATCH]").status, 0);
		const r = git(root, ["merge", "--no-ff", "-q", "side", "-m", "Merge branch 'side' into dev"]);
		assert.equal(r.status, 0, r.err);
	});
});

describe("changelog.json", () => {
	/** @type {[string, unknown, RegExp][]} */
	const bad = [
		["not an object", [], /not an object/],
		["no apps", {}, /no "apps" object/],
		["a bad tenant", { apps: { a: { tenant: "A B", language: "ro" } } }, /tenant/],
		["no language", { apps: { a: { tenant: "app-a" } } }, /language/],
		[
			"an extra key",
			{ apps: { a: { tenant: "app-a", language: "ro", x: 1 } } },
			/only "tenant" and "language"/,
		],
		["none without a reason", { apps: { a: { none: "" } } }, /say why/],
		[
			"none with a tenant",
			{ apps: { a: { none: "a static page here", tenant: "app-a" } } },
			/stands alone/,
		],
		[
			"a bad app name",
			{ apps: { "../x": { none: "a static page here" } } },
			/not an app directory/,
		],
	];
	for (const [name, doc, why] of bad)
		test(`refused: ${name}`, () => assert.throws(() => parseDeclaration(doc), why));
	test("accepted: a tenant, a none, and no apps at all", () => {
		assert.deepEqual(parseDeclaration({ apps: {} }), { apps: {} });
		assert.deepEqual(
			parseDeclaration({
				apps: { a: { tenant: "a-b", language: "en" }, b: { none: "a static page here" } },
			}),
			{ apps: { a: { tenant: "a-b", language: "en" }, b: { none: "a static page here" } } },
		);
	});
});
