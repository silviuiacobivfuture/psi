// scripts/i18n-check.mjs against small temporary sites.
//   node --test scripts/i18n-check.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { i18nProblems } from "./i18n-check.mjs";

const script = join(dirname(fileURLToPath(import.meta.url)), "i18n-check.mjs");
const roots = [];
after(() => {
	for (const r of roots) rmSync(r, { recursive: true, force: true });
});

const PLUGIN = "./node_modules/@inlang/plugin-message-format/dist/index.js";
/** A site with two message files and the compiled ids given. */
function site({ modules = [PLUGIN], plugin = true, compiled = ["a", "b", "c"] } = {}) {
	const root = mkdtempSync(join(tmpdir(), "i18n-check-"));
	roots.push(root);
	const write = (p, text) => {
		mkdirSync(dirname(join(root, p)), { recursive: true });
		writeFileSync(join(root, p), text);
	};
	write(
		"project.inlang/settings.json",
		JSON.stringify({
			baseLocale: "ro",
			modules,
			"plugin.inlang.messageFormat": {
				pathPattern: ["./messages/{locale}.json", "./messages/booking/{locale}.json"],
			},
		}),
	);
	write("messages/ro.json", JSON.stringify({ $schema: "x", a: "A", b: "B" }));
	write("messages/booking/ro.json", JSON.stringify({ $schema: "x", c: "C" }));
	if (plugin) write(PLUGIN, "export default {}");
	if (compiled !== null)
		write(
			"src/paraglide/messages/_index.js",
			compiled.map((id) => `export * from './${id}.js'`).join("\n"),
		);
	return root;
}

describe("i18n-check", () => {
	test("a whole compile from a local plugin passes", () => {
		assert.deepEqual(i18nProblems(site()), []);
		assert.equal(spawnSync("node", [script], { cwd: site() }).status, 0);
	});
	test("an empty compile (the plugin did not load) is refused, exit 1, naming the count", () => {
		const r = spawnSync("node", [script], {
			cwd: site({ compiled: [] }),
			encoding: "utf8",
		});
		assert.equal(r.status, 1);
		assert.match(r.stderr, /MISSING MESSAGES: 3 of 3 not compiled \(a, b, c\)/);
	});
	test("one message file lost is refused, naming its key", () => {
		assert.deepEqual(i18nProblems(site({ compiled: ["a", "b"] })), [
			"MISSING MESSAGES: 1 of 3 not compiled (c) — the message plugin did not load",
		]);
	});
	test("no compiled output at all is refused", () => {
		assert.match(i18nProblems(site({ compiled: null })).join(), /MISSING MESSAGES: 3 of 3/);
	});
	test("a plugin from a URL is refused, even when the compile is whole", () => {
		const url = "https://cdn.jsdelivr.net/npm/@inlang/plugin-message-format@4.4.0/dist/index.js";
		assert.deepEqual(i18nProblems(site({ modules: [url] })), [
			`REMOTE PLUGIN: ${url} — take it from node_modules, never a URL`,
		]);
	});
	test("a local plugin that is not installed is refused", () => {
		assert.match(
			i18nProblems(site({ plugin: false })).join(),
			/MISSING PLUGIN: \.\/node_modules\/@inlang/,
		);
	});
	test("$schema is not a message", () => {
		assert.deepEqual(i18nProblems(site({ compiled: ["a", "b", "c"] })), []);
	});
});
