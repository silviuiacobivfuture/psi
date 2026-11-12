// `pnpm changelog` (scripts/changelog.mjs) as a process, in a temporary estate, with a stand-in
// `kubectl` first on PATH that records every call (argv, KUBECONFIG, stdin) and answers as told.
// Every refusal asserts nothing reached the publish command.
//   node --test scripts/changelog.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const made = [];
after(() => {
	for (const d of made) rmSync(d, { recursive: true, force: true });
});

const ID = "cmhv2k8qz0001abcd1234efgh";

// The stand-in kubectl: logs one JSON line per call, answers by FAKE_* variables.
const FAKE = `#!/usr/bin/env node
const fs = require("node:fs");
const argv = process.argv.slice(2);
let stdin = "";
try { if (argv.includes("exec")) stdin = fs.readFileSync(0, "utf8"); } catch {}
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ argv, kubeconfigEnv: process.env.KUBECONFIG ?? null, stdin }) + "\\n");
const e = process.env;
if (argv.includes("ingress")) {
  if (e.FAKE_REACH === "0") { process.stderr.write("dial tcp: i/o timeout"); process.exit(1); }
  process.stdout.write(e.FAKE_HOSTS ?? ""); process.exit(0);
}
if (argv.includes("pod")) { process.stdout.write(e.FAKE_POD ?? ""); process.exit(0); }
if (argv.includes("exec")) {
  if (e.FAKE_EXEC_ERR) { process.stderr.write(e.FAKE_EXEC_ERR); process.exit(1); }
  process.stdout.write(e.FAKE_EXEC_OUT ?? ""); process.exit(0);
}
process.exit(3);
`;

function estate() {
	const root = mkdtempSync(join(tmpdir(), "changelog-cmd-"));
	made.push(root);
	const write = (/** @type {string} */ p, /** @type {string} */ s) => {
		mkdirSync(dirname(join(root, p)), { recursive: true });
		writeFileSync(join(root, p), s);
	};
	mkdirSync(join(root, "repo/scripts"), { recursive: true });
	for (const f of ["changelog.mjs", "changelog-rules.mjs"])
		copyFileSync(join(here, f), join(root, "repo/scripts", f));
	write(
		"repo/changelog.json",
		JSON.stringify({
			apps: {
				shop: { tenant: "shop", language: "ro" },
				site: { none: "a static page with no release notes" },
			},
		}),
	);
	write(
		"repo/estate/identity.yaml",
		"BASE_DOMAIN: lumen.example\nESTATE_SLUG: lumen # the slug\nENVIRONMENTS: dev,prod\n",
	);
	write("home/lumen/infrastructure/hetzner/kubeconfig-dev.yaml", "apiVersion: v1\n");
	write("other/kubeconfig.yaml", "apiVersion: v1\n");
	write("bin/kubectl", FAKE);
	chmodSync(join(root, "bin/kubectl"), 0o755);
	write("body.md", "From a **file**.\n");
	spawnSync("git", ["init", "-q"], { cwd: join(root, "repo") });
	spawnSync("git", ["config", "user.email", "dev@lumen.example"], { cwd: join(root, "repo") });
	spawnSync("git", ["config", "user.name", "Dev Person"], { cwd: join(root, "repo") });
	return root;
}

const GOOD = {
	FAKE_HOSTS: "access.lumen.example\nshop.lumen.example\n",
	FAKE_POD: "changelog-abc",
	FAKE_EXEC_OUT: `{"id":"${ID}","tenant":"shop"}`,
};
const FLAGS = [
	"--app",
	"shop",
	"--category",
	"feature",
	"--title",
	"Search",
	"--body",
	"Find **anything**.",
];

/** @param {string} root @param {string[]} args @param {Record<string, string>} [env] */
function changelog(root, args, env = {}) {
	const log = join(root, "kubectl.log");
	rmSync(log, { force: true });
	const r = spawnSync(process.execPath, [join(root, "repo/scripts/changelog.mjs"), ...args], {
		cwd: join(root, "repo"),
		encoding: "utf8",
		input: "",
		env: {
			...process.env,
			PATH: `${join(root, "bin")}:${process.env.PATH}`,
			GENESIS_HOME: join(root, "home"),
			KUBECONFIG: join(root, "other/kubeconfig.yaml"), // ambient: must never be used
			FAKE_LOG: log,
			...env,
		},
	});
	const calls = existsSync(log)
		? readFileSync(log, "utf8")
				.split("\n")
				.filter(Boolean)
				.map((l) => JSON.parse(l))
		: [];
	return {
		status: r.status,
		out: r.stdout,
		err: r.stderr,
		calls,
		execs: calls.filter((c) => c.argv.includes("exec")),
	};
}

describe("refused — nothing reaches the publish command", () => {
	/** @type {[string, string[], Record<string, string>, RegExp, boolean][]} name, args, env, why, reachesKubectl */
	const cases = [
		[
			"a missing flag with no terminal",
			["--app", "shop", "--category", "feature", "--body", "x"],
			GOOD,
			/missing --title \(no terminal/,
			false,
		],
		[
			"--json never prompts",
			["--json", "--app", "shop"],
			GOOD,
			/missing --category, --title, --body/,
			false,
		],
		[
			"an undeclared app",
			["--app", "ghost", "--category", "feature", "--title", "t", "--body", "b"],
			GOOD,
			/apps\/ghost is not declared/,
			false,
		],
		[
			"an app with no changelog",
			["--app", "site", "--category", "feature", "--title", "t", "--body", "b"],
			GOOD,
			/keeps no changelog/,
			false,
		],
		[
			"an unknown category",
			["--app", "shop", "--category", "feat", "--title", "t", "--body", "b"],
			GOOD,
			/--category is one of/,
			false,
		],
		[
			"a blank title",
			["--app", "shop", "--category", "feature", "--title", " ", "--body", "b"],
			GOOD,
			/--title is empty/,
			false,
		],
		[
			"a date that is no day",
			[...FLAGS, "--date", "2026-02-30"],
			GOOD,
			/--date is not a day/,
			false,
		],
		[
			"a date in another shape",
			[...FLAGS, "--date", "12.11.2026"],
			GOOD,
			/--date is YYYY-MM-DD/,
			false,
		],
		["an unknown flag", [...FLAGS, "--tenant", "x"], GOOD, /unknown argument: --tenant/, false],
		["a flag with no value", ["--app"], GOOD, /--app needs a value/, false],
		[
			"an environment the estate does not have",
			[...FLAGS, "--env", "staging"],
			GOOD,
			/staging is not one of the estate's environments/,
			false,
		],
		[
			"no kubeconfig for the environment",
			[...FLAGS, "--env", "prod"],
			GOOD,
			/no kubeconfig for lumen prod/,
			false,
		],
		[
			"the cluster does not answer",
			FLAGS,
			{ ...GOOD, FAKE_REACH: "0" },
			/cannot reach lumen dev[\s\S]*i\/o timeout/,
			true,
		],
		[
			"the cluster is another estate's",
			FLAGS,
			{ ...GOOD, FAKE_HOSTS: "sso.other.example\n" },
			/ANOTHER estate \(hosts: sso\.other\.example\)/,
			true,
		],
		[
			"a look-alike domain",
			FLAGS,
			{ ...GOOD, FAKE_HOSTS: "notlumen.example\n" },
			/ANOTHER estate/,
			true,
		],
		[
			"a cluster with no ingress at all",
			FLAGS,
			{ ...GOOD, FAKE_HOSTS: "" },
			/ANOTHER estate \(hosts: none\)/,
			true,
		],
		[
			"no running changelog pod",
			FLAGS,
			{ ...GOOD, FAKE_POD: "" },
			/no running changelog pod/,
			true,
		],
	];
	for (const [name, args, env, why, reaches] of cases) {
		test(name, () => {
			const r = changelog(estate(), args, env);
			assert.equal(r.status, 1);
			assert.match(r.err + r.out, why);
			assert.equal(r.execs.length, 0, "nothing was handed to the publish command");
			if (!reaches) assert.equal(r.calls.length, 0, "kubectl was never called");
		});
	}

	test("the service refuses (an unprovisioned tenant): its reason, verbatim", () => {
		const r = changelog(estate(), FLAGS, {
			...GOOD,
			FAKE_EXEC_ERR:
				'publish failed: no "shop" tenant — provision the estate first\ncommand terminated with exit code 1',
		});
		assert.equal(r.status, 1);
		assert.match(r.err, /changelog: no "shop" tenant — provision the estate first\n$/);
		assert.doesNotMatch(r.err, /command terminated/, "kubectl's own exit line is not the reason");
	});

	test("the service answers no id", () => {
		const r = changelog(estate(), FLAGS, { ...GOOD, FAKE_EXEC_OUT: "{}" });
		assert.equal(r.status, 1);
		assert.match(r.err, /answered no id/);
	});

	test("--json refusals are one JSON line", () => {
		const r = changelog(estate(), [...FLAGS, "--json"], { ...GOOD, FAKE_HOSTS: "x.other.example" });
		assert.equal(r.status, 1);
		assert.match(JSON.parse(r.out).error, /ANOTHER estate/);
	});
});

describe("published", () => {
	test("through the estate's own kubeconfig, never the ambient one; prints the trailer", () => {
		const root = estate();
		const r = changelog(root, [...FLAGS, "--version", "1.4.0", "--json"], GOOD);
		assert.equal(r.status, 0, r.err);
		assert.deepEqual(JSON.parse(r.out), {
			app: "shop",
			tenant: "shop",
			id: ID,
			trailer: `Changelog: shop ${ID}`,
		});
		const own = join(root, "home/lumen/infrastructure/hetzner/kubeconfig-dev.yaml");
		assert.equal(r.calls.length, 3, "verify, find the pod, publish");
		for (const c of r.calls) {
			assert.equal(c.argv[0], "--kubeconfig");
			assert.equal(c.argv[1], own);
			assert.equal(c.kubeconfigEnv, null, "the ambient KUBECONFIG is not passed on");
		}
		assert.deepEqual(r.execs[0].argv.slice(-8), [
			"exec",
			"-i",
			"changelog-abc",
			"-c",
			"changelog",
			"--",
			"node",
			"dist/publish.js",
		]);
		assert.deepEqual(JSON.parse(r.execs[0].stdin), {
			tenant: "shop",
			title: "Search",
			body: "Find **anything**.",
			category: "feature",
			version: "1.4.0",
			pinned: false,
			authorEmail: "dev@lumen.example",
			authorName: "Dev Person",
		});
	});

	test("human output names the trailer to add", () => {
		const r = changelog(estate(), FLAGS, GOOD);
		assert.equal(r.status, 0, r.err);
		assert.match(r.out, new RegExp(`Published to shop: ${ID}[\\s\\S]*Changelog: shop ${ID}`));
	});

	test("--kubeconfig is used, and still verified as this estate", () => {
		const root = estate();
		const other = join(root, "other/kubeconfig.yaml");
		const ok = changelog(root, [...FLAGS, "--kubeconfig", other], GOOD);
		assert.equal(ok.status, 0, ok.err);
		for (const c of ok.calls) assert.equal(c.argv[1], other);
		const refused = changelog(root, [...FLAGS, "--kubeconfig", other], {
			...GOOD,
			FAKE_HOSTS: "a.other.example",
		});
		assert.equal(refused.status, 1);
		assert.equal(refused.execs.length, 0);
	});

	test("--body-file, --pinned, --date, --author", () => {
		const root = estate();
		const r = changelog(
			root,
			[
				"--app",
				"shop",
				"--category",
				"bugfix",
				"--title",
				"Totals",
				"--body-file",
				join(root, "body.md"),
				"--pinned",
				"--date",
				"2026-11-12",
				"--author",
				"ops@lumen.example",
				"--author-name",
				"Ops",
			],
			GOOD,
		);
		assert.equal(r.status, 0, r.err);
		const e = JSON.parse(r.execs[0].stdin);
		assert.equal(e.body, "From a **file**.\n");
		assert.equal(e.pinned, true);
		assert.equal(e.publishedAt, "2026-11-12T12:00:00.000Z");
		assert.equal(e.authorEmail, "ops@lumen.example");
		assert.equal(e.authorName, "Ops");
	});

	test("--dry-run reaches no cluster", () => {
		const r = changelog(estate(), [...FLAGS, "--dry-run"], GOOD);
		assert.equal(r.status, 0, r.err);
		assert.equal(r.calls.length, 0);
		const out = JSON.parse(r.out);
		assert.equal(out.dryRun, true);
		assert.equal(out.language, "ro");
		assert.equal(out.entry.tenant, "shop");
	});
});
