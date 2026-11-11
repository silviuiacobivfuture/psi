#!/usr/bin/env node
// The commit-message rule (.husky/commit-msg): a conventional commit carrying a version tag.
//   <type>(<scope>)?!?: <subject> [PATCH|UPDATE|RELEASE]
// Merge, fixup! and squash! messages are exempt. Refused, by name: no conventional header, no
// version tag, a throwaway subject (WIP, temp, "updates", "changes").
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (file === undefined) {
	process.stderr.write("usage: commit-msg.mjs <message file>\n");
	process.exit(2);
}
const message = readFileSync(file, "utf8")
	.split("\n")
	.filter((l) => !l.startsWith("#"))
	.join("\n")
	.trim();
const header = message.split("\n")[0] ?? "";
if (/^(Merge |fixup! |squash! |Revert ")/.test(header)) process.exit(0);
/** @type {string[]} */
const refusals = [];
const TYPES = "feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert";
if (!new RegExp(`^(${TYPES})(\\([a-z0-9./-]+\\))?!?: \\S`).test(header))
	refusals.push(`the first line is not a conventional commit (${TYPES}): "${header}"`);
if (!/\[(PATCH|UPDATE|RELEASE)\]/.test(message))
	refusals.push("no version tag: add [PATCH] (fix), [UPDATE] (feature) or [RELEASE] (breaking)");
if (/^[a-z]+(\([^)]*\))?!?:\s*(wip|temp|updates?|changes?)\b/i.test(header))
	refusals.push("a throwaway subject: say what changed");
if (refusals.length > 0) {
	for (const r of refusals) process.stderr.write(`COMMIT REFUSED: ${r}\n`);
	process.exit(1);
}
