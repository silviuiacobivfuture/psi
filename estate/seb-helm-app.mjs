#!/usr/bin/env node
// The estate's Argo CD Application for one SEB HELM piece, from the bundle's template.
//
//   node estate/seb-helm-app.mjs <piece dir> <app name> <label> <header> <bundle>
//
// <piece dir> holds the bundle's pieces/<id>/application.yaml and values.yaml (contract:
// SEB's tools/bundle/helm-piece.mjs). Writes to stdout the Application = the template with every
// ${KEY} naming a key of the release's identity schema filled from this estate's identity
// (estate/identity.yaml, read through its one loader); any other ${...} (shell `${VAR:-}`,
// `${HOME}`) is literal text and stays as written, the same rule as a kustomize piece's files;
// metadata.name <app name>, the <label> (k=v) added, and the rendered values.yaml as
// spec.source.helm.values — text for text, so the chart sees exactly the values it would from a
// hand-written Application. A values.yaml holding nothing but blank lines and comments (the
// chart's defaults) writes NO helm.values, as a hand-written Application without values has none
// (the contract's helmValuesEmpty). <header> is written as the file's first comment line.
// <bundle> is the bundle by digest (<registry>/seb/bundle@sha256:…) the values came from, written as
// spec.info seb-bundle exactly as a directory piece's Application carries it, so Kyverno's
// verify-seb-signatures (rule seb-bundle-signed) checks SEB's signature on what this Application
// deploys from the bundle: its values.
//
// Refuses (exit 1, nothing on stdout): a bundle that is not <host>/<path>@sha256:<64 hex>; a
// placeholder naming an identity key this estate does not set; a
// template that is not one Application with one chart source; values already in the template.
// Called by estate/seb-upgrade.sh; commits nothing.
//
// SIZE (2026-11-13). Argo CD copies an Application's source into spec, status.sync.comparedTo,
// status.operationState and every status.history entry, and gRPC refuses a message over 2 MB:
// homepage's 240 KB of inline hub values made its Application 2.24 MB and its sync hung. So:
//   * every Application written here keeps spec.revisionHistoryLimit 2 (Argo's default is 10);
//   * with --values-out <file> <path in the estate repo> <branch>, values that would make the
//     Application larger than APP_BUDGET go OUT of it: written to <file>, and read by Argo from
//     the estate's own repository (identity GIT_SSH_URL, <branch>) as a second source,
//     `ref: estate`, through helm.valueFiles. Values within the budget stay inline, unchanged;
//   * a written Application over APP_BUDGET is refused, either way.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isMap, parse, parseDocument } from "yaml";
import { sebRoot } from "./seb-root.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** @param {string} msg @returns {never} */
function refuse(msg) {
	process.stderr.write(`REFUSED: ${msg}\n`);
	process.exit(1);
}

const argv = process.argv.slice(2);
const vo = argv.indexOf("--values-out");
const valuesOut =
	vo === -1 ? null : { file: argv[vo + 1], repoPath: argv[vo + 2], branch: argv[vo + 3] };
if (vo !== -1) argv.splice(vo, 4);
const [dir, name, label, header, bundle] = argv;
/** The largest Application written, in bytes: well under gRPC's 2 MB with every copy Argo keeps. */
const APP_BUDGET = 64 * 1024;
if (!dir || !name || !label || !header || !bundle) {
	process.stderr.write(
		"usage: seb-helm-app.mjs <piece dir> <app name> <label k=v> <header> <bundle@sha256:…> [--values-out <file> <repo path> <branch>]\n",
	);
	process.exit(2);
}
if (valuesOut !== null && (!valuesOut.file || !valuesOut.repoPath || !valuesOut.branch))
	refuse("--values-out takes <file> <path in the estate repo> <branch>");
if (!/^[a-z0-9.-]+(:[0-9]+)?(\/[a-z0-9._-]+)+@sha256:[0-9a-f]{64}$/.test(bundle))
	refuse(`bundle "${bundle}" is not <registry>/<path>@sha256:<digest>`);
const [labelKey, labelValue] = label.split("=", 2);
if (!labelKey || labelValue === undefined) refuse(`label "${label}" is not k=v`);

/** This estate's identity, through its one loader. @returns {Map<string, string>} */
function identity() {
	const r = spawnSync(
		process.execPath,
		[
			join(sebRoot(root), "tools/identity/load.mjs"),
			"configmap",
			join(root, "estate/identity.yaml"),
		],
		{ encoding: "utf8" },
	);
	if (r.status !== 0) refuse(`the estate identity does not load:\n${(r.stderr ?? "").trim()}`);
	/** @type {unknown} */
	const cm = parse(r.stdout);
	const data =
		typeof cm === "object" &&
		cm !== null &&
		"data" in cm &&
		typeof cm.data === "object" &&
		cm.data !== null
			? cm.data
			: refuse("the identity loader rendered no ConfigMap data");
	return new Map(Object.entries(data).map(([k, v]) => [k, String(v)]));
}

/** The identity keys the release's schema defines: the only names a ${KEY} fills. @returns {Set<string>} */
function schemaKeys() {
	const path = join(sebRoot(root), "schema/identity.schema.json");
	/** @type {unknown} */
	let s;
	try {
		s = JSON.parse(readFileSync(path, "utf8"));
	} catch (e) {
		return refuse(`no identity schema at ${path}: ${e instanceof Error ? e.message : String(e)}`);
	}
	const props =
		typeof s === "object" && s !== null && "properties" in s && typeof s.properties === "object"
			? s.properties
			: null;
	if (props === null) refuse(`${path} has no properties: not the identity schema`);
	return new Set(Object.keys(props));
}

const values = identity();
const keys = schemaKeys();
const KEY = /^[A-Z][A-Z0-9_]*$/;
/** @param {string} f @param {string} text @returns {string} */
function fill(f, text) {
	return text.replace(/\$\{([^}]*)\}/g, (whole, k) => {
		if (!KEY.test(k) || !keys.has(k)) return whole;
		const v = values.get(k);
		if (v === undefined) refuse(`${f}: ${whole} names an identity key this estate does not set`);
		return v;
	});
}

const read = (/** @type {string} */ f) => {
	try {
		return readFileSync(join(dir, f), "utf8");
	} catch {
		return refuse(`${dir} holds no ${f}: not a helm piece`);
	}
};
const doc = parseDocument(fill("application.yaml", read("application.yaml")));
if (doc.errors.length > 0) refuse(`application.yaml does not parse: ${doc.errors[0]?.message}`);
const renderedValues = fill("values.yaml", read("values.yaml"));
const p = doc.toJS();
if (p?.apiVersion !== "argoproj.io/v1alpha1" || p?.kind !== "Application")
	refuse("application.yaml is not an argoproj.io/v1alpha1 Application");
if (p.spec?.sources !== undefined || typeof p.spec?.source?.chart !== "string")
	refuse("application.yaml is not one chart source");
const helm = p.spec.source.helm;
if (helm && ("values" in helm || "valuesObject" in helm || "valueFiles" in helm))
	refuse("application.yaml carries helm values itself");

doc.setIn(["metadata", "name"], name);
doc.setIn(["metadata", "namespace"], "argocd");
doc.setIn(["metadata", "labels", labelKey], labelValue);
if (doc.getIn(["spec", "info"]) !== undefined) refuse("application.yaml carries spec.info itself");
doc.setIn(["spec", "info"], doc.createNode([{ name: "seb-bundle", value: bundle }]));
doc.setIn(["spec", "revisionHistoryLimit"], 2);
const noValues = renderedValues
	.split("\n")
	.every((l) => l.trim() === "" || l.trimStart().startsWith("#"));
if (!noValues) {
	if (!isMap(doc.getIn(["spec", "source", "helm"])))
		doc.setIn(["spec", "source", "helm"], doc.createNode({}));
	doc.setIn(["spec", "source", "helm", "values"], renderedValues);
}
doc.commentBefore = doc.commentBefore ? ` ${header}\n${doc.commentBefore}` : ` ${header}`;
let out = doc.toString({ lineWidth: 0 });
// The written file must say exactly the values it was given: parse it back.
if (parse(out)?.spec?.source?.helm?.values !== (noValues ? undefined : renderedValues))
	refuse("the written Application does not carry the values text unchanged");
if (Buffer.byteLength(out) > APP_BUDGET && !noValues && valuesOut !== null) {
	// The values go to the estate's repository; the chart source reads them as a value file.
	const gitUrl = values.get("GIT_SSH_URL");
	if (!gitUrl)
		refuse(
			"the identity derives no GIT_SSH_URL: the values cannot be read from the estate's repository",
		);
	const chart = doc.getIn(["spec", "source"]);
	doc.deleteIn(["spec", "source"]);
	doc.setIn(["spec", "sources"], doc.createNode([]));
	doc.addIn(["spec", "sources"], chart);
	doc.deleteIn(["spec", "sources", 0, "helm", "values"]);
	doc.setIn(
		["spec", "sources", 0, "helm", "valueFiles"],
		doc.createNode([`$estate/${valuesOut.repoPath}`]),
	);
	doc.addIn(
		["spec", "sources"],
		doc.createNode({ repoURL: gitUrl, targetRevision: valuesOut.branch, ref: "estate" }),
	);
	out = doc.toString({ lineWidth: 0 });
	writeFileSync(valuesOut.file, renderedValues);
	if (readFileSync(valuesOut.file, "utf8") !== renderedValues)
		refuse("the values file does not carry the values text unchanged");
}
if (Buffer.byteLength(out) > APP_BUDGET)
	refuse(
		`the Application for ${name} would be ${Buffer.byteLength(out)} bytes, over the ${APP_BUDGET}-byte budget (Argo copies it into every status entry; gRPC refuses 2 MB)${valuesOut === null ? ": pass --values-out to move its values out" : ""}`,
	);
process.stdout.write(out);
