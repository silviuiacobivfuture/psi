// scripts/affected-apps.mjs against a small temporary workspace.
//   node --test scripts/affected-apps.test.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "affected-apps.mjs");
const root = mkdtempSync(join(tmpdir(), "affected-"));
after(() => rmSync(root, { recursive: true, force: true }));

const write = (path, text) => {
	mkdirSync(dirname(join(root, path)), { recursive: true });
	writeFileSync(join(root, path), text);
};
const pkg = (path, name, deps = {}) =>
	write(`${path}/package.json`, JSON.stringify({ name, dependencies: deps }));

// site → ui → design; cms → content; deploy (no package.json) copies packages/store; lib has no app.
pkg("packages/design", "@x/design");
pkg("packages/ui", "@x/ui", { "@x/design": "workspace:*" });
pkg("packages/content", "@x/content");
pkg("packages/store", "@x/store");
pkg("packages/lonely", "@x/lonely");
pkg("apps/site", "@x/site", { "@x/ui": "workspace:*", hono: "^4" });
pkg("apps/cms", "@x/cms", { "@x/content": "workspace:^" });
pkg("apps/tool", "@x/tool");
write("apps/site/Dockerfile", "FROM node\n");
write("apps/cms/Dockerfile", "FROM node\n");
write("apps/deploy/Dockerfile", "FROM node\nCOPY packages/store /store\n");

const run = (files) =>
	execFileSync(process.execPath, [script], { cwd: root, input: files.join("\n") })
		.toString()
		.split("\n")
		.filter(Boolean);

describe("affected apps", () => {
	test("a file inside an app affects that app only", () => {
		assert.deepEqual(run(["apps/cms/src/a.ts"]), ["cms"]);
	});
	test("a package reaches every app depending on it, through other packages too", () => {
		assert.deepEqual(run(["packages/design/tokens.css"]), ["site"]);
		assert.deepEqual(run(["packages/ui/x.ts", "packages/content/y.ts"]), ["cms", "site"]);
	});
	test("an app without package.json is reached through the packages its Dockerfile names", () => {
		assert.deepEqual(run(["packages/store/schema.ts"]), ["deploy"]);
	});
	test("an app without a Dockerfile is never listed", () => {
		assert.deepEqual(run(["apps/tool/x.ts"]), []);
	});
	test("files no image builds from affect nothing", () => {
		assert.deepEqual(run(["docs/plan.md", "packages/lonely/a.ts", "gitops/x.yaml"]), []);
		assert.deepEqual(run([]), []);
	});
	test("the lockfile, the workspace and the platform lock affect every app", () => {
		for (const f of [
			"pnpm-lock.yaml",
			"pnpm-workspace.yaml",
			"package.json",
			"estate/platform.lock",
		]) {
			assert.deepEqual(run([f]), ["cms", "deploy", "site"], f);
		}
	});
	test("a non-workspace dependency named like a package does not link", () => {
		pkg("apps/other", "@x/other", { "@x/ui": "^1.0.0" });
		write("apps/other/Dockerfile", "FROM node\n");
		assert.deepEqual(run(["packages/ui/x.ts"]), ["site"]);
	});
});
