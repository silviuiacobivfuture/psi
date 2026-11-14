import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const SCRIPT = new URL(
	"../../../gitops/services/scheduling-deploy/base/backup-upload.sh",
	import.meta.url,
).pathname;

/**
 * A stand-in `aws` on PATH: `list-objects-v2` answers the newest LastModified of the tier named by its --prefix from
 * FAKE_NEWEST_<TIER> ("None" when unset), or fails when FAKE_LIST_FAIL is set; `put-object` succeeds. Every call is
 * appended to FAKE_LOG.
 */
const FAKE_AWS = `#!/bin/bash
echo "$*" >> "$FAKE_LOG"
case "$2" in
list-objects-v2)
	[ -z "\${FAKE_LIST_FAIL:-}" ] || { echo "listing refused" >&2; exit 254; }
	prefix=""; while [ $# -gt 0 ]; do [ "$1" = "--prefix" ] && prefix="$2"; shift; done
	tier="$(echo "$prefix" | cut -d/ -f2 | tr a-z A-Z)"
	var="FAKE_NEWEST_$tier"; echo "\${!var:-None}" ;;
put-object) echo '{"ETag":"x"}' ;;
*) echo "unexpected aws call: $*" >&2; exit 1 ;;
esac
`;

describe("backup-upload.sh fills each tier by age, not by the clock", () => {
	const dirs: string[] = [];
	afterAll(() => {
		for (const d of dirs) rmSync(d, { recursive: true, force: true });
	});
	const hoursAgo = (h: number): string => new Date(Date.now() - h * 3_600_000).toISOString();

	function run(env: Record<string, string>, files = true) {
		const dir = mkdtempSync(join(tmpdir(), "backup-upload-"));
		dirs.push(dir);
		writeFileSync(join(dir, "aws"), FAKE_AWS);
		chmodSync(join(dir, "aws"), 0o755);
		if (files) {
			writeFileSync(join(dir, "convex.zip.enc"), "sealed");
			writeFileSync(join(dir, "manifest.json"), "{}");
		}
		const log = join(dir, "calls.log");
		writeFileSync(log, "");
		const r = spawnSync("bash", [SCRIPT], {
			encoding: "utf8",
			env: {
				PATH: `${dir}:${process.env.PATH}`,
				BACKUP_BUCKET: "b",
				BACKUP_ENDPOINT: "https://s3.invalid",
				BACKUP_WORK: dir,
				FAKE_LOG: log,
				...env,
			},
		});
		const puts = readFileSync(log, "utf8")
			.split("\n")
			.filter((l) => l.includes("put-object"))
			.map((l) => /--key convex\/([a-z]+)\//.exec(l)?.[1] ?? "?");
		return { r, puts };
	}

	it("a new environment (no daily, no monthly copy) fills all three tiers on its first run", () => {
		const { r, puts } = run({});
		expect(r.status).toBe(0);
		// export + manifest per tier
		expect(puts).toEqual(["hourly", "hourly", "daily", "daily", "monthly", "monthly"]);
	});

	it("a daily copy younger than 23 h and a monthly one younger than 28 days: only the hourly tier is written", () => {
		const { r, puts } = run({
			FAKE_NEWEST_DAILY: hoursAgo(2),
			FAKE_NEWEST_MONTHLY: hoursAgo(24 * 10),
		});
		expect(r.status).toBe(0);
		expect(puts).toEqual(["hourly", "hourly"]);
		expect(r.stdout).toMatch(/daily: newest is 2 h old, kept/);
	});

	it("a daily copy 23 h old or more (a missed midnight) is made good by this run", () => {
		for (const h of [23, 30]) {
			const { r, puts } = run({ FAKE_NEWEST_DAILY: hoursAgo(h), FAKE_NEWEST_MONTHLY: hoursAgo(5) });
			expect(r.status, `${h} h`).toBe(0);
			expect(puts, `${h} h`).toEqual(["hourly", "hourly", "daily", "daily"]);
		}
		const { puts } = run({ FAKE_NEWEST_DAILY: hoursAgo(22.5), FAKE_NEWEST_MONTHLY: hoursAgo(5) });
		expect(puts).toEqual(["hourly", "hourly"]);
	});

	it("a monthly copy 28 days old is renewed", () => {
		const { puts } = run({
			FAKE_NEWEST_DAILY: hoursAgo(1),
			FAKE_NEWEST_MONTHLY: hoursAgo(28 * 24),
		});
		expect(puts).toEqual(["hourly", "hourly", "monthly", "monthly"]);
	});

	it("a bucket that cannot be listed fails the run before anything is uploaded (never a silent skip)", () => {
		const { r, puts } = run({ FAKE_LIST_FAIL: "1" });
		expect(r.status).not.toBe(0);
		expect(puts).toEqual([]);
	});

	it("a missing export fails the run by name, uploading nothing", () => {
		const { r, puts } = run({}, false);
		expect(r.status).toBe(1);
		expect(r.stderr).toContain("convex.zip.enc missing or empty");
		expect(puts).toEqual([]);
	});

	it("uses nothing the image's bash lacks: it is bash 4.2 (aws-cli 2.17), so no inherit_errexit and no other 4.4+ shopt", () => {
		// 2026-11-14: `shopt -s inherit_errexit` stopped every production backup ("invalid shell option name").
		const text = readFileSync(SCRIPT, "utf8");
		expect(text).not.toMatch(
			/shopt\s+-s\s+(inherit_errexit|localvar_inherit|localvar_unset|assoc_expand_once)/,
		);
		expect(text).not.toMatch(/\$\{[A-Za-z_]+@[QEPAa]\}/);
	});

	const IMAGE = "amazon/aws-cli:2.17.0";
	const docker =
		spawnSync("docker", ["image", "inspect", IMAGE], { encoding: "utf8" }).status === 0;
	it.skipIf(!docker)(
		"runs in the job's own image (its bash 4.2): all tiers on a new bucket, and a failed listing uploads nothing",
		() => {
			const dir = mkdtempSync(join(homedir(), ".cache", "backup-upload-image-"));
			dirs.push(dir);
			writeFileSync(join(dir, "aws"), FAKE_AWS);
			chmodSync(join(dir, "aws"), 0o755);
			writeFileSync(join(dir, "convex.zip.enc"), "sealed");
			writeFileSync(join(dir, "manifest.json"), "{}");
			writeFileSync(join(dir, "backup-upload.sh"), readFileSync(SCRIPT, "utf8"));
			const inImage = (extra: string[]) => {
				writeFileSync(join(dir, "calls.log"), "");
				const r = spawnSync(
					"docker",
					[
						"run",
						"--rm",
						"--entrypoint",
						"bash",
						"-v",
						`${dir}:/t`,
						"-e",
						"PATH=/t:/usr/local/bin:/usr/bin:/bin",
						"-e",
						"BACKUP_BUCKET=b",
						"-e",
						"BACKUP_ENDPOINT=https://s3.invalid",
						"-e",
						"BACKUP_WORK=/t",
						"-e",
						"FAKE_LOG=/t/calls.log",
						...extra,
						IMAGE,
						"/t/backup-upload.sh",
					],
					{ encoding: "utf8" },
				);
				const puts = readFileSync(join(dir, "calls.log"), "utf8")
					.split("\n")
					.filter((l) => l.includes("put-object")).length;
				return { status: r.status, puts };
			};
			expect(inImage([])).toEqual({ status: 0, puts: 6 });
			const failed = inImage(["-e", "FAKE_LIST_FAIL=1"]);
			expect(failed.status).not.toBe(0);
			expect(failed.puts).toBe(0);
		},
		120_000,
	);
});
