#!/usr/bin/env node
// After `paraglide-js compile`, in a site's directory: refuse a compile that lost messages.
//
//   paraglide-js compile --project ./project.inlang --outdir ./src/paraglide && node ../../scripts/i18n-check.mjs
//
// WHY. paraglide-js exits 0 and prints "Successfully compiled" when it cannot load its message
// plugin, and emits NO messages. Measured 2026-11-13: CI's image build could not fetch the plugin
// from its CDN ("PluginImportError ... fetch failed", a WARN), built the sites with no messages, and
// both crashed at start (`bk_mail_name is not a function`) while CI reported success. So:
//
//   1. every plugin in project.inlang/settings.json `modules` is a LOCAL file that exists — never
//      a URL: a build must not depend on a CDN answering;
//   2. every key of every message file the settings name (the base locale's) is compiled.
//
// Exits 1 naming what is wrong (MISSING MESSAGES / REMOTE PLUGIN / MISSING PLUGIN); 0 otherwise.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * @param {string} dir the site's directory (holds project.inlang/ and src/paraglide/)
 * @returns {string[]} the problems; empty when the compile is whole
 */
export function i18nProblems(dir) {
	/** @type {{ baseLocale: string, modules?: string[], "plugin.inlang.messageFormat"?: { pathPattern?: string | string[] } }} */
	const settings = JSON.parse(readFileSync(join(dir, "project.inlang/settings.json"), "utf8"));
	const problems = [];
	for (const m of settings.modules ?? []) {
		if (/^[a-z]+:\/\//i.test(m))
			problems.push(`REMOTE PLUGIN: ${m} — take it from node_modules, never a URL`);
		else if (!existsSync(resolve(dir, m)))
			problems.push(`MISSING PLUGIN: ${m} does not exist (pnpm install)`);
	}
	const patterns = settings["plugin.inlang.messageFormat"]?.pathPattern ?? [];
	const keys = new Set();
	for (const p of Array.isArray(patterns) ? patterns : [patterns]) {
		const file = resolve(dir, p.replace("{locale}", settings.baseLocale));
		for (const k of Object.keys(JSON.parse(readFileSync(file, "utf8"))))
			if (k !== "$schema") keys.add(k);
	}
	const index = join(dir, "src/paraglide/messages/_index.js");
	const compiled = new Set(
		existsSync(index)
			? [...readFileSync(index, "utf8").matchAll(/export \* from '\.\/(.+?)\.js'/g)].map(
					(m) => m[1],
				)
			: [],
	);
	const missing = [...keys].filter((k) => !compiled.has(k)).sort();
	if (missing.length > 0)
		problems.push(
			`MISSING MESSAGES: ${missing.length} of ${keys.size} not compiled (${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", …" : ""}) — the message plugin did not load`,
		);
	return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const problems = i18nProblems(process.cwd());
	for (const p of problems) process.stderr.write(`i18n-check: ${p}\n`);
	process.exit(problems.length > 0 ? 1 : 0);
}
