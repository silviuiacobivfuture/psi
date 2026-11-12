#!/usr/bin/env node
// The changelog rule, enforced (.husky/commit-msg): a business-facing commit (feat, fix, perf, any
// `!`, a BREAKING CHANGE footer) that stages files under apps/<app>/ carries, for every such app,
//   Changelog: <app> <entry id>        (printed by `pnpm changelog --app <app>`)
//   Changelog: <app> none — <reason>   (its users see nothing worth announcing)
// as a git trailer: the message's last paragraph. Apps declared `{"none": …}` in changelog.json
// need none. Exempt: merge, fixup!/squash!/amend!, revert, and the estate's CI deploy commits
// ([skip ci], author estate-ci). The rules: scripts/changelog-rules.mjs.
//
// It binds people and agents alike: the same hook, the same refusal, the same command to run.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { cleanMessage, readDeclaration, refusalsOf } from "./changelog-rules.mjs";

const file = process.argv[2];
if (file === undefined) {
	process.stderr.write("usage: changelog-trailer.mjs <message file>\n");
	process.exit(2);
}
/** @param {string[]} args @param {string} [input] */
const git = (args, input) =>
	execFileSync("git", args, { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] });

const message = cleanMessage(readFileSync(file, "utf8"));
const root = git(["rev-parse", "--show-toplevel"]).trim();
let declaration;
try {
	declaration = readDeclaration(root);
} catch (e) {
	process.stderr.write(`COMMIT REFUSED: ${e instanceof Error ? e.message : String(e)}\n`);
	process.exit(1);
}
const trailers = git(["interpret-trailers", "--parse", "--no-divider"], `${message}\n`)
	.split("\n")
	.flatMap((l) => {
		const m = /^changelog:\s*(.*)$/i.exec(l);
		return m ? [m[1] ?? ""] : [];
	});
const staged = git(["diff", "--cached", "--name-only", "-z"]).split("\0").filter(Boolean);
const author = git(["var", "GIT_AUTHOR_IDENT"]).trim();

const refusals = refusalsOf({ message, trailers, staged, author, declaration });
if (refusals.length > 0) {
	for (const r of refusals) process.stderr.write(`COMMIT REFUSED: ${r}\n`);
	process.stderr.write('The rule: CLAUDE.md, "Changelog". Never --no-verify past it.\n');
	process.exit(1);
}
