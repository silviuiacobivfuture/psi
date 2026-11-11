// The bundle's layer from a LOCAL OCI archive (SEB's `tools/bundle/build.mjs --dry-run --archive`)
// instead of the estate's Harbor: the same checks as a pull (lib/oci-pull.mjs), the same result.
// The archive must hold the manifest estate/platform.lock names, BY DIGEST — a local build is
// installed only when the lock pins it, so the lock stays the one statement of what runs.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

/** @param {unknown} v @returns {v is Record<string, unknown>} */
function isRecord(v) {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** @param {Buffer} b @returns {string} */
function sha256(b) {
	return `sha256:${createHash("sha256").update(b).digest("hex")}`;
}

/**
 * @param {{ archive: string, digest: string, out: string }} req
 * @returns {{ layer: string, mediaType: string }}
 */
export function layerFromArchive(req) {
	if (!existsSync(req.archive)) throw new Error(`no archive at ${req.archive}`);
	const dir = mkdtempSync(join(tmpdir(), "seb-archive-"));
	try {
		const x = spawnSync("tar", ["-xf", req.archive, "-C", dir], { encoding: "utf8" });
		if (x.status !== 0) throw new Error(`${req.archive} is not an OCI archive: ${x.stderr.trim()}`);
		/** @param {string} digest @returns {Buffer} */
		const blob = (digest) => {
			const file = join(dir, "blobs", "sha256", digest.slice("sha256:".length));
			if (!/^sha256:[0-9a-f]{64}$/.test(digest) || !existsSync(file))
				throw new Error(`${req.archive} holds no blob ${digest}`);
			const b = readFileSync(file);
			if (sha256(b) !== digest)
				throw new Error(`${req.archive}: blob ${digest} does not hash to itself`);
			return b;
		};
		/** @type {unknown} */
		const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8"));
		const listed = isRecord(index) && Array.isArray(index.manifests) ? index.manifests : [];
		const digests = listed.map((m) =>
			isRecord(m) && typeof m.digest === "string" ? m.digest : "",
		);
		if (!digests.includes(req.digest))
			throw new Error(
				`${req.archive} holds ${digests.join(", ") || "no manifest"}, not the locked ${req.digest}`,
			);
		/** @type {unknown} */
		const manifest = JSON.parse(blob(req.digest).toString("utf8"));
		const layers = isRecord(manifest) && Array.isArray(manifest.layers) ? manifest.layers : [];
		if (layers.length !== 1)
			throw new Error(`${req.digest}: a bundle has exactly one layer, this has ${layers.length}`);
		const l0 = layers[0];
		const layer = isRecord(l0) && typeof l0.digest === "string" ? l0.digest : "";
		const mediaType = isRecord(l0) && typeof l0.mediaType === "string" ? l0.mediaType : "";
		const bytes = blob(layer);
		if (mediaType.endsWith("+gzip") || mediaType.endsWith(".gzip"))
			writeFileSync(req.out, gunzipSync(bytes));
		else if (mediaType.endsWith(".tar")) writeFileSync(req.out, bytes);
		else throw new Error(`${req.digest}: its layer is ${mediaType || "untyped"}, not a tar`);
		return { layer, mediaType };
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}
