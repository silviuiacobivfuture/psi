#!/usr/bin/env node
// What the EDITOR contacts from a person's browser. A setting that quiets the server
// can leave the page calling home, and no capture in the pod would see it.
//
//   node gitops/services/n8n/selftest/browser-egress.mjs <origin> <owner-password-file>
//
// Signs in as the owner in real Chromium, opens the pages a person opens, and records
// every request whose host is not the origin's, and every one to the same-origin
// passthroughs n8n forwards to its telemetry servers (/rest/telemetry, /rest/ph), which is
// how the editor's telemetry leaves. Exit 1 on any. `--expect-some` inverts that for the
// control run against upstream's defaults, which must see one or the other, or this proof
// shows nothing.
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const [origin, passwordFile] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const expectSome = process.argv.includes("--expect-some");
const OWNER = "ops@recomex.eu";
const PAGES = ["/home/workflows", "/workflow/new", "/settings/personal", "/home/credentials", "/home/executions"];

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const foreign = new Map();
const local = new Set();
const passthrough = new Map();
let rendered = 0;
page.on("request", (request) => {
	const url = new URL(request.url());
	if (url.protocol === "data:" || url.protocol === "blob:") return;
	if (url.origin === origin) {
		local.add(url.pathname.split("/").slice(0, 3).join("/"));
		if (/^\/rest\/(telemetry|ph)(\/|$)/.test(url.pathname)) passthrough.set(url.pathname, (passthrough.get(url.pathname) ?? 0) + 1);
		return;
	}
	foreign.set(url.host, (foreign.get(url.host) ?? 0) + 1);
});

const answer = await context.request.post(`${origin}/rest/login`, {
	data: { emailOrLdapLoginId: OWNER, password: readFileSync(passwordFile, "utf8").trim() },
});
if (!answer.ok()) {
	console.error(`FAIL sign-in answered ${answer.status()}`);
	await browser.close();
	process.exit(2);
}
console.log("signed in as the owner");
for (const path of PAGES) {
	await page.goto(`${origin}${path}`, { waitUntil: "load", timeout: 60_000 }).catch((e) => console.log(`  ${path}: ${e.message.split("\n")[0]}`));
	// A cold editor takes tens of seconds, and with telemetry on the network never goes
	// idle (both measured): wait for it to have rendered, then for it to have said it all.
	await page.waitForFunction(() => document.title !== "" && !document.title.startsWith("n8n.io"), null, { timeout: 60_000 }).catch(() => {});
	await page.waitForTimeout(10_000);
	const title = await page.title();
	console.log(`  opened ${path} — title "${title}"`);
	rendered += title.startsWith("n8n.io") || title === "" ? 0 : 1;
}
await browser.close();
if (rendered === 0) {
	console.log("FAIL no page rendered, so nothing was exercised");
	process.exit(2);
}
console.log(`pages rendered: ${rendered} of ${PAGES.length}`);
console.log(`same-origin paths seen: ${local.size}`);
console.log(`hosts contacted other than the origin: ${foreign.size}`);
for (const [host, count] of foreign) console.log(`  ${count}x ${host}`);
console.log(`requests to the telemetry passthroughs: ${passthrough.size}`);
for (const [path, count] of passthrough) console.log(`  ${count}x ${path}`);
if (expectSome) {
	if (foreign.size === 0 && passthrough.size === 0) {
		console.log("FAIL control: the page called nobody, so this proof shows nothing");
		process.exit(1);
	}
	console.log("PASS control: the page calls out under upstream's defaults");
	process.exit(0);
}
if (local.size === 0) {
	console.log("FAIL the editor made no request at all, so nothing was exercised");
	process.exit(1);
}
if (foreign.size > 0 || passthrough.size > 0) {
	console.log("FAIL the editor contacted someone");
	process.exit(1);
}
console.log("PASS the editor contacted nobody but its own origin, and sent no telemetry through it");
