// What an installed SEB bundle must hold before anything here builds against it: bundle.json
// names the locked version, and every piece, profile, image context, tool tree and library it
// records is there and hashes to the sum it records (SEB's tools/bundle/build.mjs writes them).
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** @param {unknown} v @returns {v is Record<string, unknown>} */
function isRecord(v) {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** @param {unknown} v @returns {unknown[]} */
function list(v) {
	return Array.isArray(v) ? v : [];
}

/** @param {Record<string, unknown>} r @param {string} k @returns {string} */
function str(r, k) {
	const v = r[k];
	return typeof v === "string" ? v : "";
}

/** SEB's tree sum: every file's path and bytes, sorted. @param {string} dir @returns {string} */
export function treeSum(dir) {
	const h = createHash("sha256");
	/** @param {string} rel */
	const walk = (rel) => {
		for (const name of readdirSync(join(dir, rel)).sort()) {
			const r = rel === "" ? name : `${rel}/${name}`;
			if (statSync(join(dir, r)).isDirectory()) walk(r);
			else {
				h.update(`${r}\0`);
				h.update(readFileSync(join(dir, r)));
				h.update("\0");
			}
		}
	};
	walk("");
	return `sha256:${h.digest("hex")}`;
}

/** @param {string} file @returns {string} */
function fileSum(file) {
	return `sha256:${createHash("sha256").update(readFileSync(file)).digest("hex")}`;
}

/**
 * @param {string} dest the extracted bundle
 * @param {string} ref what was pulled, for messages
 * @param {string} wantVersion the lock's version
 * @returns {string[]} every artefact checked
 */
export function checkBundle(dest, ref, wantVersion) {
	const manifestFile = join(dest, "bundle.json");
	if (!existsSync(manifestFile)) throw new Error(`${ref} holds no bundle.json`);
	/** @type {unknown} */
	const m = JSON.parse(readFileSync(manifestFile, "utf8"));
	if (!isRecord(m)) throw new Error(`${ref}: bundle.json is not an object`);
	if (m.version !== wantVersion)
		throw new Error(`${ref} says it is version ${String(m.version)}, the lock says ${wantVersion}`);
	/** @type {string[]} */
	const out = ["bundle.json"];
	/** @param {string} path @param {string} sum @param {"tree" | "file"} kind */
	const check = (path, sum, kind) => {
		if (path === "" || path.includes("..") || !existsSync(join(dest, path)))
			throw new Error(`${ref}: bundle.json names "${path}", which the bundle does not hold`);
		const have = kind === "tree" ? treeSum(join(dest, path)) : fileSum(join(dest, path));
		if (have !== sum)
			throw new Error(`${ref}: ${path} does not hold what bundle.json records (${have} ≠ ${sum})`);
		out.push(path);
	};
	for (const p of list(m.pieces)) {
		if (!isRecord(p)) throw new Error(`${ref}: bundle.json has a piece that is not an object`);
		const id = str(p, "id");
		if (id === "" || !existsSync(join(dest, "pieces", id)))
			throw new Error(`${ref}: bundle.json names a piece "${id}" the bundle does not hold`);
		out.push(`pieces/${id}`);
		for (const q of list(p.profiles)) if (isRecord(q)) check(str(q, "path"), str(q, "sum"), "tree");
		if (isRecord(p.image)) check(str(p.image, "path"), str(p.image, "sum"), "tree");
	}
	for (const t of list(m.tools)) if (isRecord(t)) check(str(t, "path"), str(t, "sum"), "tree");
	for (const l of list(m.libs))
		if (isRecord(l)) check(str(l, "path"), str(l, "sum"), l.kind === "npm" ? "file" : "tree");
	return out;
}
