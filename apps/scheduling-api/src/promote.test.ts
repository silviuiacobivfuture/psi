import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const rootUrl = new URL("../../../", import.meta.url);
const root = rootUrl.pathname;
const read = (p: string): string => readFileSync(new URL(p, rootUrl), "utf8");

/** service -> the service whose dev overlay names its tag */
const SERVICES: Record<string, string> = {
	"scheduling-backend": "scheduling-backend",
	"scheduling-deploy": "scheduling-deploy",
	"scheduling-sync": "scheduling-deploy",
	"scheduling-api": "scheduling-api",
	clinic: "clinic",
};

describe("tools/scheduling/promote.sh", () => {
	const dirs: string[] = [];
	afterAll(() => {
		for (const d of dirs) rmSync(d, { recursive: true, force: true });
	});

	const overlay = (dir: string, service: string, env: string): string =>
		join(dir, `gitops/services/${service}/overlays/${env}/kustomization.yaml`);

	/** A throwaway repository holding only the overlays the script touches; dev runs `devTags[service]` (default: all one tag). */
	function sandbox(devTag: string, devTags: Record<string, string> = {}): string {
		const dir = mkdtempSync(join(tmpdir(), "promote-"));
		dirs.push(dir);
		mkdirSync(join(dir, "tools/scheduling"), { recursive: true });
		cpSync(join(root, "tools/scheduling/promote.sh"), join(dir, "tools/scheduling/promote.sh"));
		for (const [service, source] of Object.entries(SERVICES)) {
			for (const [env, owner] of [
				["prod", service],
				["dev", source],
			] as const) {
				mkdirSync(join(dir, `gitops/services/${owner}/overlays/${env}`), { recursive: true });
				cpSync(
					join(root, `gitops/services/${owner}/overlays/${env}/kustomization.yaml`),
					overlay(dir, owner, env),
				);
			}
		}
		for (const source of new Set(Object.values(SERVICES)))
			execFileSync("sed", [
				"-i",
				`s/newTag: ".*"/newTag: "${devTags[source] ?? devTag}"/`,
				overlay(dir, source, "dev"),
			]);
		const git = (...a: string[]): string => execFileSync("git", a, { cwd: dir, encoding: "utf8" });
		git("init", "-q");
		git("add", ".");
		git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "base");
		return dir;
	}
	const run = (dir: string, args: string[], env: Record<string, string> = {}) =>
		spawnSync("bash", [join(dir, "tools/scheduling/promote.sh"), ...args], {
			cwd: dir,
			encoding: "utf8",
			env: {
				...process.env,
				GIT_AUTHOR_NAME: "t",
				GIT_AUTHOR_EMAIL: "t@t",
				GIT_COMMITTER_NAME: "t",
				GIT_COMMITTER_EMAIL: "t@t",
				...env,
			},
		});
	const tagsOf = (dir: string): Record<string, string> =>
		Object.fromEntries(
			Object.keys(SERVICES).map((s) => [
				s,
				/newTag: "([^"]*)"/.exec(readFileSync(overlay(dir, s, "prod"), "utf8"))?.[1] ?? "",
			]),
		);
	const all = (tag: string): Record<string, string> =>
		Object.fromEntries(Object.keys(SERVICES).map((s) => [s, tag]));
	const head = (dir: string): string =>
		execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" });

	it("sets every service dev runs at that sha, from the sha's first seven characters, and commits them", () => {
		const dir = sandbox("abc1234");
		const r = run(dir, ["abc1234def5678abc1234def5678abc1234def56"]);
		expect(r.status).toBe(0);
		expect(tagsOf(dir)).toEqual(all("abc1234"));
		const log = execFileSync("git", ["log", "-1", "--format=%s", "--name-only"], {
			cwd: dir,
			encoding: "utf8",
		});
		expect(log).toContain("promote");
		expect(log.match(/overlays\/prod\/kustomization\.yaml/g)).toHaveLength(5);
	});

	it("promotes only the services whose dev tag is that sha, and says which it left alone", () => {
		// CI builds only the apps a push changed: dev's services run different tags.
		const dir = sandbox("abc1234", { clinic: "1111111", "scheduling-backend": "2222222" });
		const r = run(dir, ["abc1234"]);
		expect(r.status).toBe(0);
		expect(tagsOf(dir)).toEqual({
			...all("abc1234"),
			clinic: "unpromoted",
			"scheduling-backend": "unpromoted",
		});
		expect(r.stderr).toContain("left alone: clinic (dev runs 1111111)");
		expect(r.stderr).toContain("left alone: scheduling-backend (dev runs 2222222)");
	});

	it("scheduling-sync follows scheduling-deploy's tag: it runs that image", () => {
		const dir = sandbox("abc1234", { "scheduling-deploy": "3333333" });
		expect(run(dir, ["3333333", "--no-commit"]).status).toBe(0);
		expect(tagsOf(dir)).toMatchObject({
			"scheduling-deploy": "3333333",
			"scheduling-sync": "3333333",
			"scheduling-api": "unpromoted",
		});
	});

	it("`dev` copies each service's current dev tag", () => {
		const dir = sandbox("abc1234", { clinic: "1111111" });
		expect(run(dir, ["dev"]).status).toBe(0);
		expect(tagsOf(dir)).toEqual({ ...all("abc1234"), clinic: "1111111" });
	});

	it("`dev` skips a service dev has not built yet (CI's placeholders), and refuses when none is built", () => {
		const half = sandbox("abc1234", { clinic: "bootstrap", "scheduling-api": "unbuilt" });
		const r = run(half, ["dev", "--no-commit"]);
		expect(r.status).toBe(0);
		expect(tagsOf(half)).toMatchObject({
			clinic: "unpromoted",
			"scheduling-api": "unpromoted",
			"scheduling-backend": "abc1234",
		});
		expect(r.stderr).toContain("dev has no built image");
		const none = sandbox("unbuilt");
		expect(run(none, ["dev"]).status).toBe(1);
		expect(tagsOf(none)).toEqual(all("unpromoted"));
	});

	it("does not touch dev's overlays", () => {
		const dir = sandbox("abc1234");
		const dev = readFileSync(overlay(dir, "clinic", "dev"), "utf8");
		run(dir, ["abc1234", "--no-commit"]);
		expect(readFileSync(overlay(dir, "clinic", "dev"), "utf8")).toBe(dev);
	});

	it("--no-commit edits and stops: the working tree is dirty, nothing is committed", () => {
		const dir = sandbox("abc1234");
		const before = head(dir);
		expect(run(dir, ["abc1234", "--no-commit"]).status).toBe(0);
		expect(head(dir)).toBe(before);
		expect(execFileSync("git", ["status", "--porcelain"], { cwd: dir, encoding: "utf8" })).not.toBe(
			"",
		);
	});

	it("is a no-op the second time", () => {
		const dir = sandbox("abc1234");
		run(dir, ["abc1234"]);
		const after = head(dir);
		const again = run(dir, ["abc1234"]);
		expect(again.status).toBe(0);
		expect(again.stdout).toContain("already runs");
		expect(head(dir)).toBe(after);
	});

	it.each([
		["not hex", "zzzzzzz"],
		["too short", "abc12"],
		["upper case", "ABC1234"],
		["too long", "a".repeat(41)],
	])("refuses a sha that is %s, changing nothing", (_why, sha) => {
		const dir = sandbox("abc1234");
		expect(run(dir, [sha]).status).toBe(2);
		expect(tagsOf(dir)).toEqual(all("unpromoted"));
	});

	it("refuses a build dev does not run, unless the override is given", () => {
		const dir = sandbox("abc1234");
		const r = run(dir, ["fffffff"]);
		expect(r.status).toBe(1);
		expect(r.stderr).toContain("no production service has a dev tag to promote");
		expect(tagsOf(dir)).toEqual(all("unpromoted"));
		expect(run(dir, ["fffffff", "--no-commit"], { PROMOTE_ALLOW_UNTESTED: "1" }).status).toBe(0);
		expect(tagsOf(dir)).toEqual(all("fffffff"));
	});

	it("refuses missing or extra arguments", () => {
		const dir = sandbox("abc1234");
		expect(run(dir, []).status).toBe(2);
		expect(run(dir, ["abc1234", "--push"]).status).toBe(2);
	});
});

describe("the old-app sync's manifests", () => {
	const cron = read("gitops/services/scheduling-sync/overlays/prod/cronjob.yaml");
	const dev = read("gitops/services/scheduling-sync/overlays/dev-once/job.yaml");

	it("production's CronJob is suspended, every 15 minutes, never overlapping, and holds the real-data switch", () => {
		expect(cron).toMatch(/^ {2}suspend: true$/m);
		expect(cron).toMatch(/^ {2}schedule: "\*\/15 \* \* \* \*"$/m);
		expect(cron).toMatch(/^ {2}concurrencyPolicy: Forbid$/m);
		expect(cron).toContain('{ name: SYNC_ALLOW_REAL, value: "1" }');
		expect(cron).not.toContain("--anonymize");
		expect(cron).toContain("scheduling-backend.scheduling-backend-prod.svc");
		expect(cron).toContain("psi-scheduling-prod");
	});

	it("the dev Job anonymizes, cannot write real data, and targets dev's own store and bucket", () => {
		expect(dev).toContain('"--anonymize"');
		expect(dev).not.toMatch(/name: SYNC_ALLOW_REAL/);
		expect(dev).toContain("scheduling-backend.scheduling.svc");
		expect(dev).toContain("psi-scheduling-dev");
		expect(dev).not.toContain("scheduling-prod");
		expect(read("gitops/services/scheduling-sync/overlays/dev/externalsecret.yaml")).not.toContain(
			"-prod",
		);
	});

	it("every secret key is declared in the ExternalSecret and checked by assert-secrets, in both", () => {
		for (const [secret, job] of [
			[read("gitops/services/scheduling-sync/overlays/prod/externalsecret.yaml"), cron],
			[read("gitops/services/scheduling-sync/overlays/dev/externalsecret.yaml"), dev],
		] as const) {
			const keys = [...secret.matchAll(/secretKey: (\w+)/g)].map((m) => m[1] ?? "");
			expect(keys).toHaveLength(8);
			for (const k of keys) expect(job, k).toContain(`MISSING REQUIRED SECRET: ${k}`);
		}
	});

	it("the Dockerfile carries the bundle and the mapping, and the Applications are registered", () => {
		const docker = read("apps/scheduling-deploy/Dockerfile");
		expect(docker).toContain("build:sync");
		expect(docker).toContain("/app/sync-old.mjs");
		expect(docker).toContain("/app/mapping.json");
		const apps = read("gitops/apps/overlays/dev/apps/kustomization.yaml");
		expect(apps).toContain("- scheduling-sync.yaml");
		expect(apps).toContain("- scheduling-sync-prod.yaml");
		expect(read("gitops/apps/overlays/dev/apps/scheduling-sync-prod.yaml")).toContain(
			"overlays/prod",
		);
		// the one-shot Job is created by hand: no Application points at it
		expect(read("gitops/apps/overlays/dev/apps/scheduling-sync.yaml")).not.toMatch(
			/path: .*dev-once/,
		);
	});

	it("both stores admit the sync's pods, from their own namespace only", () => {
		for (const f of ["base", "overlays/prod"]) {
			const p = read(`gitops/services/scheduling-backend/${f}/networkpolicy.yaml`);
			expect(p).toMatch(/- podSelector:\n\s+matchLabels: \{ app: scheduling-sync \}/);
		}
	});
});
