#!/usr/bin/env node
// The estate's values inside Authentik's blueprint TEXT, read from the estate identity.
//
//   node gitops/platform/authentik/identity/lines.mjs           write lines.yaml + replacements.yaml
//   node gitops/platform/authentik/identity/lines.mjs --check   refuse a copy that differs
//
// A blueprint is one multi-line string in a ConfigMap, and kustomize can only
// replace a whole value or one delimiter-separated part of it. So every blueprint
// line that carries an estate value is written with a token (WLDOMAIN, WLBRAND, …)
// and REBUILT whole from the identity, then put back at its line index:
//
//   line = head + V1 + mid1 + V2 + … + Vn + tail
//   1. an empty field gets Vn prepended with `tail` as the delimiter → Vn + tail
//   2. each earlier Vi is prepended with `midi` as the delimiter     → Vi + midi + …
//   3. an empty field gets that appended with `head` as the delimiter → head + …
//   4. the result replaces line <index> of the blueprint ("\n"-split)
//
// Prepending/appending onto an empty field adds the delimiter exactly once and
// nothing else, so the rebuilt line is byte-for-byte the line with its values in.
// Values come from the whitelabel ConfigMap (gitops/components/whitelabel), which
// is generated from estate/identity.yaml. A token left in a rendered manifest is a
// line this generator did not see; the seb-authentik-identity gate refuses it.
//
// Only ConfigMap `data:` block scalars (`key: |`) are scanned; a token anywhere
// else is filled by the hand-written replacements in identity/fields.yaml.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "..");

/** token → whitelabel ConfigMap key. Longest first, so no token shadows another. */
export const TOKENS = {
	WLHEADSCALEPREFIX: "HEADSCALE_HOST_PREFIX",
	WLOPERATOREMAIL: "OPERATOR_EMAIL",
	WLOPERATORNAME: "OPERATOR_NAME",
	WLAFFINEPREFIX: "AFFINE_HOST_PREFIX",
	WLWEBMAILPREFIX: "WEBMAIL_HOST_PREFIX",
	WLMAILPREFIX: "MAIL_HOST_PREFIX",
	WLOPERATOR: "OPERATOR_USERNAME",
	WLPOLARISPREFIX: "AUTORIZARE_HOST_PREFIX",
	WLPLANEPREFIX: "PLANE_HOST_PREFIX",
	WLPLUNKPREFIX: "PLUNK_HOST_PREFIX",
	WLHUBPREFIX: "HUB_HOST_PREFIX",
	WLAUTHHOST: "AUTHENTIK_HOST",
	WLREGISTRY: "REGISTRY_HOST",
	WLOPSEMAIL: "OPS_EMAIL",
	WLTAILNET: "TAILNET_DOMAIN",
	WLDOMAIN: "BASE_DOMAIN",
	WLBRAND: "BRAND_TITLE",
	WLSLUG: "ESTATE_SLUG",
	WLMESH: "MESH_BASE_DOMAIN",
};
const TOKEN_RE = new RegExp(Object.keys(TOKENS).join("|"), "g");
const LINES_CM = "authentik-identity-lines";

/** @param {string} text @returns {string[]} the resource files a kustomization lists */
function resources(text) {
	const out = [];
	let inRes = false;
	for (const line of text.split("\n")) {
		if (/^resources:\s*$/.test(line)) {
			inRes = true;
			continue;
		}
		if (inRes && /^\S/.test(line)) inRes = false;
		const m = inRes && line.match(/^\s+-\s+(\S+\.ya?ml)\s*$/);
		if (m) out.push(m[1]);
	}
	return out;
}

/**
 * Every token-bearing line inside a ConfigMap data block scalar.
 * @param {string} file @param {string} text
 * @returns {{file: string, cm: string, key: string, index: number, line: string}[]}
 */
export function scan(file, text) {
	const found = [];
	for (const doc of text.split(/^---\s*$/m)) {
		if (!/^kind:\s*ConfigMap\s*$/m.test(doc)) continue;
		const name = doc.match(/^metadata:\s*\n(?:\s+.*\n)*?\s{2}name:\s*(\S+)/m)?.[1];
		if (!name) throw new Error(`${file}: a ConfigMap without metadata.name`);
		const lines = doc.split("\n");
		const dataAt = lines.findIndex((l) => /^data:\s*$/.test(l));
		if (dataAt < 0) continue;
		for (let i = dataAt + 1; i < lines.length && !/^\S/.test(lines[i]); i++) {
			const head = lines[i].match(/^(\s+)([^\s#][^:]*):\s*\|[-+]?\s*$/);
			if (!head) continue;
			let j = i + 1;
			while (j < lines.length && lines[j].trim() === "") j++;
			const indent = lines[j]?.match(/^(\s*)/)?.[1] ?? "";
			if (indent.length <= head[1].length) continue;
			let k = i + 1;
			for (; k < lines.length; k++) {
				const l = lines[k];
				if (l.trim() !== "" && !l.startsWith(indent)) break;
				const content = l.startsWith(indent) ? l.slice(indent.length) : "";
				TOKEN_RE.lastIndex = 0;
				if (TOKEN_RE.test(content))
					found.push({ file, cm: name, key: head[2], index: k - i - 1, line: content });
			}
			i = k - 1;
		}
	}
	return found;
}

/** @param {string} line @returns {{lits: string[], toks: string[]}} head, mids, tail around the tokens */
export function split(line) {
	const lits = [];
	const toks = [];
	let at = 0;
	for (const m of line.matchAll(TOKEN_RE)) {
		lits.push(line.slice(at, m.index));
		toks.push(m[0]);
		at = (m.index ?? 0) + m[0].length;
	}
	lits.push(line.slice(at));
	return { lits, toks };
}

const q = (s) => JSON.stringify(s);
const wl = (tok) => `{kind: ConfigMap, name: whitelabel, fieldPath: data.${TOKENS[tok]}}`;
const field = (f, opts) =>
	`[{select: {kind: ConfigMap, name: ${LINES_CM}}, fieldPaths: [data.${f}]${opts ? `, options: ${opts}` : ""}}]`;

/** @returns {{lines: string, replacements: string}} */
export function render() {
	const kust = readFileSync(join(dir, "kustomization.yaml"), "utf8");
	const hits = resources(kust).flatMap((f) => scan(f, readFileSync(join(dir, f), "utf8")));
	const keys = [];
	const reps = [];
	hits.forEach((h, n) => {
		const id = `L${String(n + 1).padStart(3, "0")}`;
		const { lits, toks } = split(h.line);
		reps.push(`# ${h.file} · ${h.cm} · ${h.key} · line ${h.index}`);
		keys.push(id);
		const last = toks.length - 1;
		const tail = lits[last + 1];
		reps.push(`- source: ${wl(toks[last])}`);
		reps.push(`  targets: ${field(id, tail === "" ? "" : `{delimiter: ${q(tail)}, index: -1}`)}`);
		for (let t = last - 1; t >= 0; t--) {
			const mid = lits[t + 1];
			if (mid === "")
				throw new Error(
					`${h.file}: ${h.cm} ${h.key} line ${h.index}: two tokens touch — nothing to delimit them`,
				);
			reps.push(`- source: ${wl(toks[t])}`);
			reps.push(`  targets: ${field(id, `{delimiter: ${q(mid)}, index: -1}`)}`);
		}
		let whole = id;
		if (lits[0] !== "") {
			whole = `${id}h`;
			keys.push(whole);
			reps.push(`- source: {kind: ConfigMap, name: ${LINES_CM}, fieldPath: data.${id}}`);
			reps.push(`  targets: ${field(whole, `{delimiter: ${q(lits[0])}, index: 1}`)}`);
		}
		const target = `data.${h.key.replaceAll(".", "\\.")}`;
		reps.push(`- source: {kind: ConfigMap, name: ${LINES_CM}, fieldPath: data.${whole}}`);
		reps.push(
			`  targets: [{select: {kind: ConfigMap, name: ${h.cm}}, fieldPaths: [${target}], options: {delimiter: "\\n", index: ${h.index}}}]`,
		);
	});
	const banner = [
		"# GENERATED by gitops/platform/authentik/identity/lines.mjs — DO NOT EDIT.",
		"# Regenerate after editing any blueprint: node gitops/platform/authentik/identity/lines.mjs",
	].join("\n");
	const lines = [
		banner,
		"# Working fields the replacements build each estate line in. A replacements",
		"# SOURCE only: config.kubernetes.io/local-config keeps it out of every render.",
		"apiVersion: v1",
		"kind: ConfigMap",
		"metadata:",
		`  name: ${LINES_CM}`,
		"  annotations:",
		'    config.kubernetes.io/local-config: "true"',
		"data:",
		...keys.map((k) => `  ${k}: ""`),
		"",
	].join("\n");
	return { lines, replacements: `${banner}\n${reps.join("\n")}\n` };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const out = render();
	const files = { "lines.yaml": out.lines, "replacements.yaml": out.replacements };
	if (process.argv.includes("--check")) {
		let bad = 0;
		for (const [f, want] of Object.entries(files)) {
			let have = "";
			try {
				have = readFileSync(join(here, f), "utf8");
			} catch {
				have = "";
			}
			if (have !== want) {
				console.error(
					`STALE GENERATED FILE: gitops/platform/authentik/identity/${f} — run node gitops/platform/authentik/identity/lines.mjs`,
				);
				bad++;
			}
		}
		if (bad) process.exit(1);
		console.log("ok: identity/lines.yaml and identity/replacements.yaml match the blueprints");
	} else {
		for (const [f, body] of Object.entries(files)) writeFileSync(join(here, f), body);
		console.log(`wrote identity/lines.yaml and identity/replacements.yaml`);
	}
}
