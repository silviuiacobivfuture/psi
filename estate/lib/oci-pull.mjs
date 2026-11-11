// An OCI pull BY DIGEST in plain Node, for hosts without podman (the CI runners). The bundle is
// one layer FROM scratch, so the layer IS its file tree: the manifest is fetched by the locked
// digest and checked against it, then the one layer is fetched and checked against the digest
// the manifest names. Nothing is trusted that was not checked.
//
// Credentials, in order: SEB_BUNDLE_PULL_USER + SEB_BUNDLE_PULL_PASSWORD (CI: the pull-only
// Harbor robot from OpenBao), else the containers auth file podman and docker write
// (REGISTRY_AUTH_FILE, $XDG_RUNTIME_DIR/containers/auth.json, ~/.config/containers/auth.json,
// ~/.docker/config.json). None found: an anonymous pull, which a private project refuses by name.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

const MANIFEST_TYPES = [
	"application/vnd.oci.image.manifest.v1+json",
	"application/vnd.docker.distribution.manifest.v2+json",
].join(", ");

/**
 * @param {{ host: string, repository: string, digest: string, out: string,
 *   env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch }} req the layer is written to `out`
 * @returns {Promise<{ layer: string, mediaType: string }>}
 */
export async function pullLayer(req) {
	const env = req.env ?? process.env;
	const f = req.fetchImpl ?? fetch;
	const basic = credentials(req.host, env);
	const token = await bearer(f, req.host, req.repository, basic);
	/** @type {Record<string, string>} */
	const auth = token === "" ? {} : { Authorization: `Bearer ${token}` };
	const mRes = await f(`https://${req.host}/v2/${req.repository}/manifests/${req.digest}`, {
		headers: { ...auth, Accept: MANIFEST_TYPES },
	});
	if (!mRes.ok)
		throw new Error(
			`${req.host}/${req.repository}@${req.digest}: the manifest answered HTTP ${mRes.status}`,
		);
	const mBytes = Buffer.from(await mRes.arrayBuffer());
	const mSum = sha256(mBytes);
	if (mSum !== req.digest)
		throw new Error(`the manifest served for ${req.digest} hashes to ${mSum}`);
	/** @type {unknown} */
	const manifest = JSON.parse(mBytes.toString("utf8"));
	const layers = isRecord(manifest) && Array.isArray(manifest.layers) ? manifest.layers : [];
	if (layers.length !== 1)
		throw new Error(`${req.digest}: a bundle has exactly one layer, this has ${layers.length}`);
	const l0 = layers[0];
	const layer = isRecord(l0) && typeof l0.digest === "string" ? l0.digest : "";
	const mediaType = isRecord(l0) && typeof l0.mediaType === "string" ? l0.mediaType : "";
	if (!/^sha256:[0-9a-f]{64}$/.test(layer))
		throw new Error(`${req.digest}: its layer has no digest`);
	const bRes = await f(`https://${req.host}/v2/${req.repository}/blobs/${layer}`, {
		headers: auth,
		redirect: "follow",
	});
	if (!bRes.ok)
		throw new Error(`${req.repository}@${layer}: the layer answered HTTP ${bRes.status}`);
	const bBytes = Buffer.from(await bRes.arrayBuffer());
	const bSum = sha256(bBytes);
	if (bSum !== layer) throw new Error(`the layer served for ${layer} hashes to ${bSum}`);
	// Decompressed here, so extracting needs nothing but tar (no gzip on the host is assumed).
	if (mediaType.endsWith("+gzip")) writeFileSync(req.out, gunzipSync(bBytes));
	else if (mediaType.endsWith(".tar")) writeFileSync(req.out, bBytes);
	else throw new Error(`${req.digest}: its layer is ${mediaType || "untyped"}, not a tar`);
	return { layer, mediaType };
}

/** @param {Buffer} b @returns {string} */
function sha256(b) {
	return `sha256:${createHash("sha256").update(b).digest("hex")}`;
}

/**
 * The registry's token for a pull of one repository (Docker token auth), or "" when the
 * registry asks for none.
 * @param {typeof fetch} f @param {string} host @param {string} repository @param {string} basic
 * @returns {Promise<string>}
 */
async function bearer(f, host, repository, basic) {
	const probe = await f(`https://${host}/v2/`);
	if (probe.status !== 401) return "";
	const challenge = probe.headers.get("www-authenticate") ?? "";
	const realm = /realm="([^"]+)"/.exec(challenge)?.[1];
	const service = /service="([^"]+)"/.exec(challenge)?.[1];
	if (realm === undefined) throw new Error(`${host} asks for credentials but names no token realm`);
	const url = new URL(realm);
	if (service !== undefined) url.searchParams.set("service", service);
	url.searchParams.set("scope", `repository:${repository}:pull`);
	const res = await f(url, { headers: basic === "" ? {} : { Authorization: `Basic ${basic}` } });
	if (!res.ok) throw new Error(`${host}: the token endpoint answered HTTP ${res.status}`);
	/** @type {unknown} */
	const body = await res.json();
	const token = isRecord(body) ? (body.token ?? body.access_token) : undefined;
	if (typeof token !== "string" || token === "")
		throw new Error(`${host}: the token endpoint returned no token`);
	return token;
}

/** base64 `user:password` for the host, or "". @param {string} host @param {NodeJS.ProcessEnv} env @returns {string} */
function credentials(host, env) {
	const user = env.SEB_BUNDLE_PULL_USER ?? "";
	const pass = env.SEB_BUNDLE_PULL_PASSWORD ?? "";
	if (user !== "" || pass !== "") {
		if (user === "" || pass === "")
			throw new Error(
				"SEB_BUNDLE_PULL_USER and SEB_BUNDLE_PULL_PASSWORD are set together or not at all",
			);
		return Buffer.from(`${user}:${pass}`).toString("base64");
	}
	const home = env.HOME ?? homedir();
	const files = [
		env.REGISTRY_AUTH_FILE ?? "",
		env.XDG_RUNTIME_DIR ? join(env.XDG_RUNTIME_DIR, "containers", "auth.json") : "",
		join(home, ".config", "containers", "auth.json"),
		join(home, ".docker", "config.json"),
	];
	for (const file of files) {
		if (file === "" || !existsSync(file)) continue;
		/** @type {unknown} */
		let doc;
		try {
			doc = JSON.parse(readFileSync(file, "utf8"));
		} catch {
			continue;
		}
		const auths = isRecord(doc) && isRecord(doc.auths) ? doc.auths : {};
		const entry = auths[host];
		if (isRecord(entry) && typeof entry.auth === "string" && entry.auth !== "") return entry.auth;
	}
	return "";
}

/** @param {unknown} v @returns {v is Record<string, unknown>} */
function isRecord(v) {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}
