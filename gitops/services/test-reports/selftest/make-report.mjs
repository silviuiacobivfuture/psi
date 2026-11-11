// Synthesise a Vitest jest-compatible JSON report in the exact shape
// apps/rmx-brs/test-report.json has: { testResults: [ { name, assertionResults:
// [ { status, title, fullName, failureMessages } ] } ] }.
//
// usage: node make_report.mjs <out.json> <variant> [app]
//
// `app` exists because the business-area mapping became PER APP in phase 4 (three
// suites collide on identical path fragments — see .github/scripts/test-areas.mjs).
// Passing `rmx-sign` emits rmx-sign-SHAPED file paths, so the offline harness
// proves the per-app resolution end to end instead of only ever exercising one
// list. The paths below are real ones from apps/rmx-sign/lib.
import { writeFileSync } from "node:fs";

const [out, variant = "green", app = "rmx-brs"] = process.argv.slice(2);

const suite = (name, tests) => ({
	name: `/home/runner/work/platform/platform/apps/${app}/${name}`,
	assertionResults: tests,
});
const t = (title, status = "passed", msg) => ({
	title,
	fullName: title,
	status,
	failureMessages: msg ? [msg] : [],
});

const STACK =
	"AssertionError: expected 500 to be 250\n" +
	"    at eval (tests/documents/proforma.test.ts:88:24)\n" +
	"    at runTest (node_modules/vitest/dist/chunk.js:1201:7)";

const invoicingFail = variant === "green" ? "passed" : "failed";
const ordersFail = variant === "worse" ? "failed" : "passed";

// rmx-sign's suite lives entirely under lib/ (its vitest.config.ts includes only
// `lib/**\/*.test.ts`), so none of the rmx-brs fragments above can match it. Kept
// small: its job is to prove the per-app list resolves, not to mirror all 64 files.
const RMX_SIGN_REPORT = {
	numTotalTests: 0,
	testResults: [
		suite("lib/vault/crypto.test.ts", [
			t("nu stochează niciodată o parolă în clar"),
			t("respinge o cheie de seif expirată"),
		]),
		suite("lib/email-source/evaluate.test.ts", [
			t("acceptă doar expeditori din lista permisă"),
			t(
				"ignoră un atașament fără semnătură validă",
				variant === "green" ? "passed" : "failed",
				variant === "green" ? undefined : STACK,
			),
		]),
		suite("lib/__tests__/webhook-mode.test.ts", [
			t("un webhook duplicat nu redeschide un dosar semnat"),
		]),
	],
};

const RMX_BRS_REPORT = {
	numTotalTests: 0,
	testResults: [
		suite("tests/documents/proforma.test.ts", [
			t("refuză a DOUA conversie a aceleiași proforme"),
			t("blochează o factură al cărei client nu are cod fiscal"),
			t(
				"factură de 750 cu încasare de 250 → rest 500",
				invoicingFail,
				invoicingFail === "failed" ? STACK : undefined,
			),
			t("nu emite factură pe o serie epuizată", "skipped"),
		]),
		suite("tests/proBono/scutire.test.ts", [
			t("scutirea pro bono nu generează TVA"),
			t("<script>alert(1)</script> rămâne text, nu cod"),
		]),
		suite("tests/orders/lifecycle.test.ts", [
			t("un dosar închis nu mai poate fi editat"),
			t(
				"trecerea în „depus” cere cel puțin un document",
				ordersFail,
				ordersFail === "failed" ? STACK : undefined,
			),
			t("anularea unui dosar eliberează numărul de ordine"),
		]),
		suite("convex/lib/canonicalRules/apply.test.ts", [
			t("aplică starea canonică o singură dată per eveniment"),
			t("respinge o tranziție de stare necunoscută"),
		]),
		suite("tests/rbac/permissions.test.ts", [
			t("un operator nu poate șterge o companie"),
			t(
				"doar administratorul schimbă rolurile",
				variant === "regression" ? "failed" : "passed",
				variant === "regression" ? STACK : undefined,
			),
		]),
	],
};

const report = app === "rmx-sign" ? RMX_SIGN_REPORT : RMX_BRS_REPORT;

writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
console.log(`wrote ${out} (${variant})`);
