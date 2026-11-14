import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const root = new URL("../../../", import.meta.url).pathname;
const script = join(root, "tools/ci/local-release.sh");
const text = readFileSync(script, "utf8");
const hasBuildx = spawnSync("docker", ["buildx", "version"]).status === 0;

describe("tools/ci/local-release.sh (dev's images built on a workstation)", () => {
	const dirs: string[] = [];
	afterAll(() => {
		for (const d of dirs) rmSync(d, { recursive: true, force: true });
	});

	it("is valid bash", () => {
		expect(spawnSync("bash", ["-n", script]).status).toBe(0);
	});

	it("deploys dev only: the branch is fixed, no argument or setting names another, and no prod overlay is written", () => {
		expect(text).toMatch(/^ENV_BRANCH=dev$/m);
		expect(text.match(/ENV_BRANCH=/g)).toHaveLength(1);
		expect(text).not.toMatch(/overlays\/prod/);
		expect(text).toMatch(/merge-base --is-ancestor "\$SHA" "origin\/\$ENV_BRANCH"/);
	});

	it("keeps secrets off argv and out of the output, and runs the repository's hooks on its commits", () => {
		expect(text).toMatch(/--password-stdin/);
		expect(text).toMatch(/-H @"\$PRIV\/bao\.h"/);
		expect(text).not.toMatch(/--no-verify/);
		expect(text).not.toMatch(/echo[^\n]*\$BAO_TOKEN/);
	});

	it("moves no tag unless every image of the plan was pushed", () => {
		const gate = text.indexOf("not every image was pushed");
		expect(gate).toBeGreaterThan(0);
		expect(text.indexOf("deploy $TAG to $ENV_BRANCH")).toBeGreaterThan(gate);
	});

	it("refuses without the OpenBao token", () => {
		const r = spawnSync("bash", [script], { cwd: root, env: { ...process.env, BAO_TOKEN: "" } });
		expect(r.status).toBe(1);
		expect(r.stderr.toString()).toMatch(/BAO_TOKEN is not set/);
	});

	it.skipIf(!hasBuildx)("refuses a commit dev does not have", () => {
		const dir = mkdtempSync(join(tmpdir(), "local-release-"));
		dirs.push(dir);
		const git = (cwd: string, ...args: string[]) =>
			execFileSync("git", args, {
				cwd,
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
		git(dir, "init", "-q", "--bare", "-b", "dev", "origin.git");
		git(dir, "clone", "-q", "origin.git", "work");
		const work = join(dir, "work");
		writeFileSync(join(work, "a"), "1");
		git(work, "add", "a");
		git(work, "commit", "-q", "--no-verify", "-m", "a");
		git(work, "push", "-q", "--no-verify", "origin", "HEAD:refs/heads/dev");
		writeFileSync(join(work, "a"), "2");
		git(work, "commit", "-q", "--no-verify", "-am", "not on dev");
		const local = git(work, "rev-parse", "HEAD");
		mkdirSync(join(work, "node_modules/.bin"), { recursive: true });
		writeFileSync(join(work, "node_modules/.bin/biome"), "#!/bin/sh\n");
		chmodSync(join(work, "node_modules/.bin/biome"), 0o755);
		const r = spawnSync("bash", [script, local], {
			cwd: work,
			env: { ...process.env, BAO_TOKEN: "x" },
		});
		expect(r.status).toBe(1);
		expect(r.stderr.toString()).toMatch(/is not on origin\/dev/);
	});
});
