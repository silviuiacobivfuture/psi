// Is the n8n in this image inside any published security advisory? advisory-watch.yaml
// says why this exists. Exit 0: no. Exit 1: yes, naming each, or it could not tell.
// A lookup that fails is never "clean".
import { readFileSync } from "node:fs";

const API =
	process.env.N8N_ADVISORY_API ?? "https://api.github.com/repos/n8n-io/n8n/security-advisories";
const PACKAGE = process.env.N8N_PACKAGE_JSON ?? "/usr/local/lib/node_modules/n8n/package.json";
// GitHub pages this list by cursor, in the Link header; a `page` parameter is ignored and
// answers the first hundred again (measured 2026-11-03).
const MAX_PAGES = 20;
// Open-ended by nature: upstream states no fix, and it never leaves the list. Each is here
// because of something the estate does and the selftest proves, and only that id passes.
const ACCEPTED = new Map([
	[
		"GHSA-365g-vjw2-grx8",
		"Execute Command is what the node does: refused by NODES_EXCLUDE, selftest X6",
	],
]);

const parse = (v) => v.trim().split("-")[0].split(".").map(Number);
function compare(a, b) {
	const x = parse(a);
	const y = parse(b);
	for (let i = 0; i < 3; i += 1) {
		if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0) ? -1 : 1;
	}
	return 0;
}

const TESTS = {
	">=": (c) => c >= 0,
	">": (c) => c > 0,
	"<=": (c) => c <= 0,
	"<": (c) => c < 0,
	"=": (c) => c === 0,
};

// GitHub's form: ">= 2.46.0, < 2.46.1", "< 1.123.89", "= 2.0.0". One part it cannot
// read throws: an unreadable range must not read as "not affected".
export function inRange(version, range) {
	return range.split(",").every((part) => {
		const m = part.trim().match(/^(>=|<=|>|<|=)\s*(\d+(?:\.\d+){0,2}\S*)$/);
		if (!m) throw new Error(`unreadable range: ${range}`);
		return TESTS[m[1]](compare(version, m[2]));
	});
}

// GitHub lists one entry per maintained line, and the ranges overlap: an advisory fixed in
// 2.46.1 also says "< 3.0.1". Read literally that reports every 2.x as affected (it did, 60
// advisories on 2.46.4, seen on the cluster 2026-11-03). So the fixes decide: a fix in this
// minor line decides alone; else a fix at or below this version in the same major means
// the fix is in; else any newer fix means this version predates them all. Only an
// advisory that names no fix at all falls back to its range.
export function isAffected(version, vulns) {
	const fixed = [];
	for (const v of vulns) {
		if (!v.vulnerable_version_range && !v.patched_versions)
			throw new Error("states no version range");
		// Free text upstream. Forms in the real list: ">= 2.46.1", "1.123.80", "2.10.1, 2.9.3",
		// and a bound written in the wrong field ("< 1.122.0"), which is the range's end.
		if (/^\s*</.test(v.patched_versions ?? "")) {
			v.vulnerable_version_range = [v.vulnerable_version_range, v.patched_versions]
				.filter(Boolean)
				.join(", ");
			continue;
		}
		for (const part of (v.patched_versions ?? "").split(",")) {
			const m = part.trim().match(/^(?:>=\s*)?(\d+\.\d+\.\d+\S*)$/);
			if (m) fixed.push(m[1]);
		}
	}
	if (fixed.length === 0) {
		const ranges = vulns.filter((v) => v.vulnerable_version_range);
		if (ranges.length === 0) throw new Error(`unreadable fix: ${vulns[0].patched_versions}`);
		return ranges.some((v) => inRange(version, v.vulnerable_version_range));
	}
	const [major, minor] = parse(version);
	const line = fixed.filter((f) => parse(f)[0] === major && parse(f)[1] === minor);
	if (line.length > 0) return line.every((f) => compare(version, f) < 0);
	if (fixed.some((f) => parse(f)[0] === major && compare(f, version) <= 0)) return false;
	return fixed.some((f) => compare(f, version) > 0);
}

function cannotTell(why) {
	console.log(`CANNOT TELL whether this n8n is affected: ${why}`);
	process.exit(1);
}

let version;
try {
	version = JSON.parse(readFileSync(PACKAGE, "utf8")).version;
} catch (e) {
	cannotTell(`no version in ${PACKAGE}: ${e.message}`);
}
if (!/^\d+\.\d+\.\d+/.test(version ?? "")) cannotTell(`version is '${version}'`);

const affected = [];
let read = 0;
let next = `${API}?per_page=100`;
for (let page = 1; next; page += 1) {
	if (page > MAX_PAGES) cannotTell(`more than ${MAX_PAGES} pages of advisories`);
	let answer;
	try {
		answer = await fetch(next, {
			headers: { Accept: "application/vnd.github+json", "User-Agent": "n8n-advisory-watch" },
			signal: AbortSignal.timeout(30_000),
		});
	} catch (e) {
		cannotTell(`GitHub did not answer: ${e.message}`);
	}
	if (answer.status !== 200) cannotTell(`GitHub answered HTTP ${answer.status}`);
	let list;
	try {
		list = await answer.json();
	} catch {
		cannotTell("GitHub's answer is not JSON");
	}
	if (!Array.isArray(list)) cannotTell("GitHub's answer is not a list");
	next = (answer.headers.get("link") ?? "").match(/<([^>]+)>;\s*rel="next"/)?.[1];
	for (const item of list) {
		read += 1;
		if (ACCEPTED.has(item.ghsa_id)) continue;
		try {
			if ((item.vulnerabilities ?? []).length === 0) throw new Error("states no version range");
			if (isAffected(version, item.vulnerabilities)) affected.push(item);
		} catch (e) {
			cannotTell(`${item.ghsa_id}: ${e.message}`);
		}
	}
}
if (read === 0) cannotTell("the advisory list is empty");

if (affected.length === 0) {
	console.log(`n8n ${version}: inside none of ${read} published advisories`);
	process.exit(0);
}
console.log(
	`n8n ${version} IS AFFECTED by ${affected.length} advisories. Move the pin (docs/n8n/00-plan.md §9):`,
);
for (const item of affected)
	console.log(`  ${item.severity} ${item.ghsa_id} ${item.summary} ${item.html_url ?? ""}`);
process.exit(1);
