#!/usr/bin/env node
// pnpm changelog — publish one of an application's "what is new" entries into the estate's
// changelog service, and print the commit trailer that records it.
//
//   People:  pnpm changelog                       (asks for whatever is missing)
//   Agents:  pnpm changelog --app <app> --category <c> --title "…" --body "…" [--version x.y.z] --json
//            Never asks: with no terminal, a missing flag is a refusal naming it.
//
// WHERE IT WRITES. The entry goes, as JSON on stdin, to the service's own publish command inside
// its pod (`node dist/publish.js` in namespace changelog), which holds the database: no key is held
// on this machine. The tenant and the language are the app's, from changelog.json.
//
// WHICH CLUSTER. Only this estate's: the kubeconfig is the estate's own,
//   ${GENESIS_HOME:-~/.estates}/<ESTATE_SLUG>/infrastructure/hetzner/kubeconfig-<env>.yaml
// (or --kubeconfig), never the ambient KUBECONFIG or ~/.kube/config. Before anything is sent the
// cluster must answer with an ingress host under the identity's BASE_DOMAIN — a kubeconfig can be
// copied and a context named anything, the cluster's own hosts cannot. Unreachable, another
// estate, no changelog pod: refused, nothing published.
//
// Flags
//   --app <app>          the directory under apps/                                     (required)
//   --category <c>       feature|improvement|bugfix|breaking|security|note             (required)
//   --title <t>          short, user-facing                                            (required)
//   --body <md>          markdown, user-facing                    (required unless --body-file)
//   --body-file <f>      read the body from a file
//   --version <v>        the version users get it in (e.g. the one the commit's tag bumps to)
//   --pinned             fix it to the top
//   --date <YYYY-MM-DD>  when it took effect (default: now)
//   --author <email> --author-name <name>   default: git config user.email / user.name
//   --env <env>          default: the first of the identity's ENVIRONMENTS
//   --kubeconfig <f>     instead of the estate's own path (still verified as this estate)
//   --dry-run            print the entry; publish nothing, reach no cluster
//   --json               one JSON line: {app, tenant, id, trailer} or {error}
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { CATEGORIES, identityValue, readDeclaration } from "./changelog-rules.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FLAGS = {
	"--app": "app",
	"--category": "category",
	"--title": "title",
	"--body": "body",
	"--body-file": "bodyFile",
	"--version": "version",
	"--date": "date",
	"--author": "author",
	"--author-name": "authorName",
	"--env": "env",
	"--kubeconfig": "kubeconfig",
};
const SWITCHES = {
	"--pinned": "pinned",
	"--dry-run": "dryRun",
	"--json": "json",
	"--help": "help",
	"-h": "help",
};

/** @param {string[]} argv @returns {Record<string, string | boolean>} */
export function parseArgs(argv) {
	/** @type {Record<string, string | boolean>} */
	const out = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i] ?? "";
		const sw = /** @type {Record<string, string>} */ (SWITCHES)[a];
		const key = /** @type {Record<string, string>} */ (FLAGS)[a];
		if (sw) out[sw] = true;
		else if (key) {
			const v = argv[++i];
			if (v === undefined || v.startsWith("--")) throw new Error(`${a} needs a value`);
			out[key] = v;
		} else throw new Error(`unknown argument: ${a}`);
	}
	return out;
}

/** @param {string} cmd @param {string[]} args @param {string} [input] */
function run(cmd, args, input) {
	const env = { ...process.env };
	delete env.KUBECONFIG; // never the ambient cluster
	const r = spawnSync(cmd, args, { input, encoding: "utf8", env });
	return {
		ok: r.status === 0,
		out: (r.stdout ?? "").trim(),
		err: (r.stderr ?? "").trim() || (r.error?.message ?? ""),
	};
}

/** Fills what the flags left out: by asking a person, or refusing when there is no terminal. */
async function complete(
	/** @type {Record<string, string | boolean>} */ a,
	/** @type {string[]} */ apps,
) {
	const want = ["app", "category", "title", "body"].filter((k) => typeof a[k] !== "string");
	if (want.length === 0) return;
	if (!process.stdin.isTTY || a.json) {
		throw new Error(
			`missing ${want.map((k) => `--${k}`).join(", ")} (no terminal to ask on); nothing published`,
		);
	}
	const rl = createInterface({ input: process.stdin, output: process.stderr });
	try {
		const ask = async (/** @type {string} */ q) => {
			for (;;) {
				const v = (await rl.question(q)).trim();
				if (v !== "") return v;
			}
		};
		if (typeof a.app !== "string") a.app = await ask(`App (${apps.join(", ")}): `);
		if (typeof a.category !== "string")
			a.category = await ask(`Category (${CATEGORIES.join("|")}): `);
		if (typeof a.title !== "string") a.title = await ask("Title (what users see): ");
		if (typeof a.version !== "string")
			a.version = (await rl.question("Version (empty for none): ")).trim();
		if (typeof a.body !== "string") {
			process.stderr.write("Body, markdown; end with a line holding only a dot:\n");
			const lines = [];
			for (;;) {
				const l = await rl.question("");
				if (l === ".") break;
				lines.push(l);
			}
			a.body = lines.join("\n");
		}
	} finally {
		rl.close();
	}
}

/** The entry the service's publish command takes (apps/changelog/src/schemas/estate-entry.ts). */
export function entryOf(
	/** @type {Record<string, string | boolean>} */ a,
	/** @type {string} */ tenant,
) {
	const s = (/** @type {string} */ k) => (typeof a[k] === "string" ? String(a[k]).trim() : "");
	if (!CATEGORIES.includes(s("category")))
		throw new Error(`--category is one of ${CATEGORIES.join(", ")}, not "${s("category")}"`);
	if (s("title") === "") throw new Error("--title is empty");
	if (s("body") === "") throw new Error("--body is empty");
	let publishedAt;
	if (s("date") !== "") {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(s("date")))
			throw new Error(`--date is YYYY-MM-DD, not "${s("date")}"`);
		const d = new Date(`${s("date")}T12:00:00Z`);
		if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s("date"))
			throw new Error(`--date is not a day: ${s("date")}`);
		publishedAt = d.toISOString();
	}
	const gitConfig = (/** @type {string} */ k) => run("git", ["config", k]).out;
	const authorEmail = s("author") || gitConfig("user.email");
	if (authorEmail === "") throw new Error("no author: --author, or git config user.email");
	return {
		tenant,
		title: s("title"),
		body: String(a.body),
		category: s("category"),
		version: s("version"),
		pinned: a.pinned === true,
		...(publishedAt ? { publishedAt } : {}),
		authorEmail,
		authorName: s("authorName") || gitConfig("user.name"),
	};
}

/**
 * This estate's kubeconfig, verified as this estate's cluster; throws otherwise.
 * @returns {string}
 */
export function estateKubeconfig(
	/** @type {Record<string, string | boolean>} */ a,
	/** @type {string} */ root,
) {
	const idFile = join(root, "estate/identity.yaml");
	if (!existsSync(idFile)) throw new Error(`no estate identity at ${idFile}`);
	const id = readFileSync(idFile, "utf8");
	const slug = identityValue(id, "ESTATE_SLUG");
	const domain = identityValue(id, "BASE_DOMAIN");
	if (!slug || !domain) throw new Error("the identity names no ESTATE_SLUG or BASE_DOMAIN");
	const envs = (identityValue(id, "ENVIRONMENTS") ?? "dev").split(/[\s,]+/).filter(Boolean);
	const env = typeof a.env === "string" ? a.env : (envs[0] ?? "dev");
	if (!envs.includes(env))
		throw new Error(`${env} is not one of the estate's environments (${envs.join(", ")})`);
	const home = process.env.GENESIS_HOME || join(homedir(), ".estates");
	const file =
		typeof a.kubeconfig === "string"
			? resolve(a.kubeconfig)
			: join(home, slug, "infrastructure/hetzner", `kubeconfig-${env}.yaml`);
	if (!existsSync(file))
		throw new Error(`no kubeconfig for ${slug} ${env} at ${file}; nothing published`);
	const hosts = run("kubectl", [
		"--kubeconfig",
		file,
		"--request-timeout=8s",
		"get",
		"ingress",
		"-A",
		"-o",
		'jsonpath={range .items[*]}{range .spec.rules[*]}{.host}{"\\n"}{end}{end}',
	]);
	if (!hosts.ok)
		throw new Error(
			`cannot reach ${slug} ${env} through ${file}: ${hosts.err || "kubectl failed"}; nothing published`,
		);
	const list = hosts.out.split("\n").filter(Boolean);
	if (!list.some((h) => h === domain || h.endsWith(`.${domain}`)))
		throw new Error(
			`${file} answers as ANOTHER estate (hosts: ${list.slice(0, 5).join(", ") || "none"}), not ${domain}; nothing published`,
		);
	return file;
}

/** Publishes through the changelog pod; returns the entry's id. */
function publish(/** @type {string} */ kubeconfig, /** @type {object} */ entry) {
	const k = ["--kubeconfig", kubeconfig, "-n", "changelog"];
	const pod = run("kubectl", [
		...k,
		"get",
		"pod",
		"-l",
		"app=changelog",
		"--field-selector=status.phase=Running",
		"-o",
		"jsonpath={.items[0].metadata.name}",
	]);
	if (!pod.ok || pod.out === "")
		throw new Error(
			`no running changelog pod: ${pod.err || "none in namespace changelog"}; nothing published`,
		);
	const r = run(
		"kubectl",
		[...k, "exec", "-i", pod.out, "-c", "changelog", "--", "node", "dist/publish.js"],
		JSON.stringify(entry),
	);
	if (!r.ok)
		throw new Error(r.err.replace(/^publish failed: /, "") || "the publish command failed");
	let answer;
	try {
		answer = JSON.parse(r.out.split("\n").pop() ?? "");
	} catch {
		throw new Error(`the service answered something else: ${r.out.slice(0, 200)}`);
	}
	if (typeof answer?.id !== "string")
		throw new Error(`the service answered no id: ${r.out.slice(0, 200)}`);
	return /** @type {string} */ (answer.id);
}

async function main() {
	const a = parseArgs(process.argv.slice(2));
	if (a.help) {
		process.stdout.write(
			`${readFileSync(fileURLToPath(import.meta.url), "utf8")
				.split("\n")
				.slice(1, 33)
				.map((l) => l.replace(/^\/\/ ?/, ""))
				.join("\n")}\n`,
		);
		return;
	}
	const declaration = readDeclaration(ROOT);
	if (typeof a.bodyFile === "string" && typeof a.body !== "string")
		a.body = readFileSync(resolve(a.bodyFile), "utf8");
	const withTenant = Object.entries(declaration.apps).flatMap(([n, d]) =>
		"tenant" in d ? [n] : [],
	);
	await complete(a, withTenant);
	const app = String(a.app);
	const d = declaration.apps[app];
	if (d === undefined)
		throw new Error(
			`apps/${app} is not declared in changelog.json: give it a tenant, or "none" with the reason`,
		);
	if ("none" in d)
		throw new Error(
			`apps/${app} keeps no changelog (changelog.json: ${d.none}); its commits need no trailer`,
		);
	const entry = entryOf(a, d.tenant);
	if (a.dryRun) {
		process.stdout.write(`${JSON.stringify({ dryRun: true, app, language: d.language, entry })}\n`);
		return;
	}
	const id = publish(estateKubeconfig(a, ROOT), entry);
	const trailer = `Changelog: ${app} ${id}`;
	process.stdout.write(
		a.json
			? `${JSON.stringify({ app, tenant: d.tenant, id, trailer })}\n`
			: `Published to ${d.tenant}: ${id}\nEnd the commit message with:\n\n${trailer}\n`,
	);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((e) => {
		const message = e instanceof Error ? e.message : String(e);
		if (process.argv.includes("--json"))
			process.stdout.write(`${JSON.stringify({ error: message })}\n`);
		else process.stderr.write(`changelog: ${message}\n`);
		process.exit(1);
	});
}
