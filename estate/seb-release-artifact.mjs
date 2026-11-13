#!/usr/bin/env node
// Pull one SEB release's SOURCE from this estate's registry and check it is what it says it is.
// The artifact is SEB's tools/release/publish-source.mjs output, <registry>/<project>/release:<version>:
// one OCI manifest (artifactType application/vnd.seb.release.v1) whose config is release.json
// ({ format: "seb-release/1", version, commit, archive: { name, sha256, size } }) and whose one
// layer is `git archive --format=tar.gz --prefix=seb-<version>/ <commit>`.
//
//   node estate/seb-release-artifact.mjs --registry <host[:port]> --project <p> --version <v> \
//        --out <file.tar.gz> [--repository release] [--plain-http]
//
// Prints one line: `<commit> <manifest digest>`. Refuses (exit 1, `REFUSED: …`, nothing written):
// no credential, or a credential that is not the PULL-ONLY robot (robot$pull); a tag the registry
// does not hold; a manifest that is not a SEB release; a blob whose bytes are not its digest;
// release.json naming another version, a commit that is not 40 hex, or an archive that is not the
// layer; an archive whose embedded commit (git archive's pax header) is not release.json's;
// --plain-http to anything but localhost.
//
// Credential: SEB_RELEASE_AUTH_FILE, a containers auth.json (`podman login --authfile <f> -u
// 'robot$pull' <registry>`). Read in-process, never on argv, never printed.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const MANIFEST = "application/vnd.oci.image.manifest.v1+json";
const ARTIFACT_TYPE = "application/vnd.seb.release.v1";
const CONFIG_TYPE = "application/vnd.seb.release.config.v1+json";
const SOURCE_TYPE = "application/vnd.seb.release.source.v1.tar+gzip";
const PULL_ROBOT = "robot$pull";
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$/;

class Refused extends Error {}
/** @param {string} m @returns {never} */
const refuse = (m) => {
	throw new Refused(m);
};
/** @param {Buffer} b */
const sha256 = (b) => `sha256:${createHash("sha256").update(b).digest("hex")}`;
/** @param {unknown} v @returns {Record<string, unknown>} */
const rec = (v) =>
	typeof v === "object" && v !== null && !Array.isArray(v)
		? /** @type {Record<string, unknown>} */ (v)
		: {};

/** @param {string[]} argv */
function parseArgs(argv) {
	/** @type {Record<string, string>} */
	const f = {};
	let plainHttp = false;
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--plain-http") plainHttp = true;
		else if (["--registry", "--project", "--repository", "--version", "--out"].includes(a)) {
			const v = argv[++i];
			if (v === undefined) refuse(`${a} needs a value`);
			f[a] = v;
		} else refuse(`unknown argument ${a}`);
	}
	const registry = f["--registry"] ?? "";
	if (!/^[A-Za-z0-9.-]+(:[0-9]+)?$/.test(registry))
		refuse(`--registry "${registry}" is not a host[:port]`);
	const project = f["--project"] ?? "";
	const repository = f["--repository"] ?? "release";
	for (const [k, v] of [
		["--project", project],
		["--repository", repository],
	])
		if (!/^[a-z0-9][a-z0-9._-]*$/.test(v)) refuse(`${k} "${v}" is not a registry name`);
	const version = f["--version"] ?? "";
	if (!VERSION.test(version)) refuse(`version "${version}" is not major.minor.patch[-pre]`);
	const out = f["--out"] ?? "";
	if (out === "") refuse("--out <file> is required");
	if (plainHttp && !/^(localhost|127\.0\.0\.1)(:[0-9]+)?$/.test(registry))
		refuse(`--plain-http is for a local registry only, not ${registry}`);
	return { registry, project, repository, version, out, plainHttp };
}

/** The pull robot's login for <registry> from SEB_RELEASE_AUTH_FILE. @param {string} registry */
function credential(registry) {
	const file = process.env.SEB_RELEASE_AUTH_FILE ?? "";
	if (file === "")
		refuse(
			`MISSING REGISTRY CREDENTIAL: SEB_RELEASE_AUTH_FILE (podman login --authfile <file> -u '${PULL_ROBOT}' ${registry})`,
		);
	let doc;
	try {
		doc = JSON.parse(readFileSync(file, "utf8"));
	} catch {
		refuse(`SEB_RELEASE_AUTH_FILE ${file} is not a readable auth.json`);
	}
	const auth = rec(rec(rec(doc).auths)[registry]).auth;
	if (typeof auth !== "string" || auth === "")
		refuse(`SEB_RELEASE_AUTH_FILE holds no login for ${registry}`);
	const plain = Buffer.from(auth, "base64").toString("utf8");
	const at = plain.indexOf(":");
	const user = at < 0 ? plain : plain.slice(0, at);
	if (user !== PULL_ROBOT)
		refuse(
			`the release is pulled with the pull-only robot ${PULL_ROBOT}, not ${user || "an empty user"}`,
		);
	return { user, pass: at < 0 ? "" : plain.slice(at + 1) };
}

/**
 * A pull session on the registry's v2 API, with whatever auth it challenges for.
 * @param {string} base @param {string} name @param {{ user: string; pass: string }} cred
 */
async function session(base, name, cred) {
	const basic = `Basic ${Buffer.from(`${cred.user}:${cred.pass}`).toString("base64")}`;
	let auth = "";
	const ping = await fetch(`${base}/v2/`);
	if (ping.status === 401) {
		const ch = ping.headers.get("www-authenticate") ?? "";
		if (/^Basic/i.test(ch)) auth = basic;
		else if (/^Bearer/i.test(ch)) {
			const p = Object.fromEntries([...ch.matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
			if (!p.realm) refuse(`the registry's challenge names no token realm: ${ch}`);
			const u = new URL(p.realm);
			if (p.service) u.searchParams.set("service", p.service);
			u.searchParams.set("scope", `repository:${name}:pull`);
			const t = await fetch(u, { headers: { authorization: basic } });
			if (!t.ok) refuse(`the registry refused the pull robot (token ${t.status})`);
			const body = rec(await t.json());
			const tok = body.token ?? body.access_token;
			if (typeof tok !== "string" || tok === "")
				refuse("the registry's token answer holds no token");
			auth = `Bearer ${tok}`;
		} else refuse(`the registry asks for an authentication it does not name: ${ch}`);
	} else if (!ping.ok) refuse(`the registry's API answers ${ping.status} at ${base}/v2/`);
	/** @param {string} path @param {Record<string, string>} [headers] */
	return (path, headers = {}) =>
		fetch(`${base}${path}`, { headers: { ...(auth ? { authorization: auth } : {}), ...headers } });
}

/** git archive's commit id: the pax global header's `comment` record. @param {Buffer} gz */
function archiveCommit(gz) {
	let tar;
	try {
		tar = gunzipSync(gz);
	} catch {
		refuse("the release archive is not gzip");
	}
	if (tar.length < 1024 || String.fromCharCode(tar[156]) !== "g")
		refuse("the release archive carries no git archive header (no commit to compare)");
	const size = Number.parseInt(
		tar.subarray(124, 136).toString("latin1").replace(/\0.*$/s, "").trim(),
		8,
	);
	const pax = tar.subarray(512, 512 + size).toString("utf8");
	const m = /^\d+ comment=([0-9a-f]{40})$/m.exec(pax);
	if (!m) refuse("the release archive's git header names no commit");
	return m[1];
}

/** @param {ReturnType<typeof parseArgs>} o */
async function pull(o) {
	const cred = credential(o.registry);
	const name = `${o.project}/${o.repository}`;
	const call = await session(`${o.plainHttp ? "http" : "https"}://${o.registry}`, name, cred);
	const m = await call(`/v2/${name}/manifests/${o.version}`, { accept: MANIFEST });
	if (m.status === 404) refuse(`${o.registry}/${name}:${o.version} is not published`);
	if (!m.ok) refuse(`the registry answers ${m.status} for ${name}:${o.version}`);
	const bytes = Buffer.from(await m.arrayBuffer());
	const digest = sha256(bytes);
	const said = m.headers.get("docker-content-digest");
	if (said && said !== digest) refuse(`the registry says ${said} for a manifest that is ${digest}`);
	let man;
	try {
		man = rec(JSON.parse(bytes.toString("utf8")));
	} catch {
		refuse(`${name}:${o.version} answers no JSON manifest`);
	}
	if (man.artifactType !== ARTIFACT_TYPE)
		refuse(`${name}:${o.version} is not a SEB release (artifactType ${String(man.artifactType)})`);
	const cfgRef = rec(man.config);
	const layers = Array.isArray(man.layers) ? man.layers.map(rec) : [];
	if (cfgRef.mediaType !== CONFIG_TYPE) refuse("the release's config is not release.json");
	if (layers.length !== 1 || layers[0].mediaType !== SOURCE_TYPE)
		refuse("the release does not hold exactly one source archive");
	/** @param {Record<string, unknown>} ref */
	const blob = async (ref) => {
		const d = String(ref.digest);
		const r = await call(`/v2/${name}/blobs/${d}`);
		if (!r.ok) refuse(`blob ${d}: the registry answers ${r.status}`);
		const b = Buffer.from(await r.arrayBuffer());
		if (sha256(b) !== d) refuse(`blob ${d} is not its digest (${sha256(b)})`);
		return b;
	};
	let cfg;
	try {
		cfg = rec(JSON.parse((await blob(cfgRef)).toString("utf8")));
	} catch (e) {
		if (e instanceof Refused) throw e;
		refuse("release.json is not JSON");
	}
	if (cfg.format !== "seb-release/1")
		refuse(`release.json format ${String(cfg.format)} is not seb-release/1`);
	if (cfg.version !== o.version)
		refuse(`release.json says ${String(cfg.version)}, not ${o.version}`);
	const commit = String(cfg.commit ?? "");
	if (!/^[0-9a-f]{40}$/.test(commit)) refuse(`release.json names no commit (${commit})`);
	const arch = rec(cfg.archive);
	if (arch.sha256 !== layers[0].digest || arch.size !== layers[0].size)
		refuse("release.json's archive is not the artifact's layer");
	const gz = await blob(layers[0]);
	if (gz.length !== arch.size)
		refuse(`the archive is ${gz.length} bytes, release.json says ${String(arch.size)}`);
	const inside = archiveCommit(gz);
	if (inside !== commit) refuse(`the archive is of commit ${inside}, release.json says ${commit}`);
	writeFileSync(o.out, gz);
	return { commit, digest };
}

try {
	const o = parseArgs(process.argv.slice(2));
	const r = await pull(o);
	console.log(`${r.commit} ${r.digest}`);
} catch (e) {
	if (!(e instanceof Refused)) throw e;
	console.error(`REFUSED: ${e.message}`);
	process.exit(1);
}
