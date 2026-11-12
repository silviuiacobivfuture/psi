// The estate's changelog rules, shared by the command (scripts/changelog.mjs) and the commit-msg
// check (scripts/changelog-trailer.mjs). Pure: no git, no kubectl, no process exit.
//
// changelog.json (repository root) declares, per application under apps/<app>/:
//   { "tenant": "<slug>", "language": "<ro|en|…>" }   the app keeps a changelog: its entries go to
//                                                       that tenant of the estate's changelog
//                                                       service, written in that language
//   { "none": "<why this app has no changelog>" }       the app has none; its commits need no trailer
// An app that is NOT declared is held to the strict rule: a business-facing commit to it carries a
// trailer, as for an app with a tenant. Nothing is exempt by omission.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const CATEGORIES = ["feature", "improvement", "bugfix", "breaking", "security", "note"];
const SLUG = /^[a-z][a-z0-9-]{1,30}$/;
const APP = /^[a-z0-9][a-z0-9._-]*$/;
const LANGUAGE = /^[a-z]{2}(-[A-Z]{2})?$/;

/**
 * @typedef {{ tenant: string, language: string } | { none: string }} AppChangelog
 * @typedef {{ apps: Record<string, AppChangelog> }} Declaration
 */

/**
 * Parses changelog.json; throws, naming the file and the fault, on anything else.
 * @param {unknown} doc @param {string} [where] @returns {Declaration}
 */
export function parseDeclaration(doc, where = "changelog.json") {
	const bad = (/** @type {string} */ m) => {
		throw new Error(`${where}: ${m}`);
	};
	if (typeof doc !== "object" || doc === null || Array.isArray(doc)) bad("not an object");
	const apps = /** @type {Record<string, unknown>} */ (doc).apps;
	if (typeof apps !== "object" || apps === null || Array.isArray(apps)) bad('no "apps" object');
	/** @type {Record<string, AppChangelog>} */
	const out = {};
	for (const [app, v] of Object.entries(/** @type {Record<string, unknown>} */ (apps))) {
		if (!APP.test(app)) bad(`"${app}" is not an app directory name`);
		if (typeof v !== "object" || v === null || Array.isArray(v)) bad(`apps.${app}: not an object`);
		const e = /** @type {Record<string, unknown>} */ (v);
		if ("none" in e) {
			if (typeof e.none !== "string" || e.none.trim().length < 8)
				bad(`apps.${app}.none: say why the app has no changelog (8 characters or more)`);
			if (Object.keys(e).length !== 1) bad(`apps.${app}: "none" stands alone`);
			out[app] = { none: String(e.none).trim() };
			continue;
		}
		if (typeof e.tenant !== "string" || !SLUG.test(e.tenant))
			bad(`apps.${app}.tenant: a changelog tenant slug (${SLUG}) or "none"`);
		if (typeof e.language !== "string" || !LANGUAGE.test(e.language))
			bad(`apps.${app}.language: the language its entries are written in (e.g. "ro", "en")`);
		if (Object.keys(e).length !== 2) bad(`apps.${app}: only "tenant" and "language"`);
		out[app] = { tenant: String(e.tenant), language: String(e.language) };
	}
	return { apps: out };
}

/** @param {string} root @returns {Declaration} */
export function readDeclaration(root) {
	const file = join(root, "changelog.json");
	let text;
	try {
		text = readFileSync(file, "utf8");
	} catch {
		throw new Error(`no changelog.json at the repository root (${file})`);
	}
	let doc;
	try {
		doc = JSON.parse(text);
	} catch {
		throw new Error(`changelog.json is not JSON`);
	}
	return parseDeclaration(doc);
}

/** One `KEY: value` of estate/identity.yaml (flat keys; a trailing # comment dropped). */
export function identityValue(/** @type {string} */ text, /** @type {string} */ key) {
	const m = new RegExp(`^${key}:[ \\t]*([^#\\n]*?)[ \\t]*(#.*)?$`, "m").exec(text);
	return m?.[1] ? m[1].replace(/^["']|["']$/g, "") : null;
}

// ── the trailer ──────────────────────────────────────────────────────────────────────────────
//   Changelog: <app> <entry id | https URL>      the entry published for that app
//   Changelog: <app> none — <reason>             that app's users see nothing to announce
//   Changelog: <entry id | https URL>            the one app the commit touches
//   Changelog: none — <reason>                   every app the commit touches
// "—", "–", "-" or ":" separate none from its reason; the reason is 8 characters or more.

const ENTRY_ID = /^c[a-z0-9]{20,32}$/;
const URL_REF = /^https:\/\/\S+$/;
const NONE = /^none\s*(?:—|–|-|:)\s*(\S.{6,}\S)\s*$/;
const BUSINESS = /^(feat|fix|perf)(\([^)]*\))?!?: /;
const BREAKING = /^[a-z]+(\([^)]*\))?!: /;
const EXEMPT_HEADER = /^(Merge |fixup! |squash! |amend! |Revert ")/;
const CI_AUTHOR = "estate-ci";

/** @param {string} ref @returns {boolean} */
const isRef = (ref) => ENTRY_ID.test(ref) || URL_REF.test(ref) || NONE.test(ref);

/**
 * The commit message as git will record it: comment lines and everything below a scissors line
 * dropped.
 * @param {string} raw @returns {string}
 */
export function cleanMessage(raw) {
	const lines = [];
	for (const l of raw.split("\n")) {
		if (/^# -+ >8 -+$/.test(l)) break;
		if (!l.startsWith("#")) lines.push(l);
	}
	return lines.join("\n").trim();
}

/**
 * Is this commit one whose users may see a change? feat, fix, perf, any `!`, or a
 * `BREAKING CHANGE:` footer.
 * @param {string} message @returns {boolean}
 */
export function isBusinessFacing(message) {
	const header = message.split("\n")[0] ?? "";
	return BUSINESS.test(header) || BREAKING.test(header) || /^BREAKING[ -]CHANGE: /m.test(message);
}

/**
 * Every refusal for one commit, as sentences; [] when it may be recorded.
 * @param {{
 *   message: string,          the cleaned message
 *   trailers: string[],       the values of its `Changelog:` trailers (git interpret-trailers)
 *   staged: string[],         the staged paths
 *   author: string,           `git var GIT_AUTHOR_IDENT`
 *   declaration: Declaration,
 * }} c
 * @returns {string[]}
 */
export function refusalsOf(c) {
	const header = c.message.split("\n")[0] ?? "";
	if (EXEMPT_HEADER.test(header)) return [];
	if (c.message.includes("[skip ci]") && c.author.startsWith(`${CI_AUTHOR} <`)) return [];

	const touched = [
		...new Set(
			c.staged.flatMap((p) => {
				const m = /^apps\/([^/]+)\/./.exec(p);
				return m?.[1] ? [m[1]] : [];
			}),
		),
	].sort();
	const out = [];
	/** @type {Set<string>} */
	const covered = new Set();
	for (const value of c.trailers) {
		const v = value.trim();
		const [first = "", ...rest] = v.split(/\s+/);
		const tail = rest.join(" ");
		if (touched.includes(first) && rest.length > 0) {
			if (isRef(tail)) covered.add(first);
			else
				out.push(`"Changelog: ${v}": after the app, an entry id, an https URL, or none — <reason>`);
		} else if (NONE.test(v)) {
			for (const a of touched) covered.add(a);
		} else if (ENTRY_ID.test(v) || URL_REF.test(v)) {
			if (touched.length > 1)
				out.push(
					`"Changelog: ${v}" names no app, and the commit touches ${touched.length} (${touched.join(", ")}): write "Changelog: <app> ${v}"`,
				);
			else for (const a of touched) covered.add(a);
		} else {
			out.push(
				`"Changelog: ${v}" is not a changelog trailer: "<app> <entry id>", "<entry id>", an https URL, or "none — <reason>" (8 characters or more)`,
			);
		}
	}
	if (!isBusinessFacing(c.message)) return out;
	for (const app of touched) {
		const d = c.declaration.apps[app];
		if (d !== undefined && "none" in d) continue;
		if (covered.has(app)) continue;
		const publish =
			d === undefined
				? `apps/${app} is not declared in changelog.json — declare its tenant (or "none" with the reason), then`
				: `publish its entry (tenant ${d.tenant}, written in ${d.language}):`;
		out.push(
			`a business-facing commit to apps/${app} carries a Changelog trailer. ${publish}\n` +
				`      pnpm changelog --app ${app} --category <${CATEGORIES.join("|")}> --title "…" --body "…"\n` +
				`    and add the line it prints as the last paragraph of the message:\n` +
				`      Changelog: ${app} <entry id>\n` +
				`    or, when its users see nothing worth announcing:\n` +
				`      Changelog: ${app} none — <why>`,
		);
	}
	return out;
}
