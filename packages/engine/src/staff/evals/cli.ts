/**
 * The live evaluation: every scenario against a real model, through the repo's own model wiring.
 * Needs OPENROUTER_API_KEY (and optionally STAFF_EVAL_MODEL); without one it says so and exits 0,
 * so CI skips it. `pnpm --filter @psi/engine eval:staff [--only id,id] [--min 0.9]`.
 */
import { readOpenRouterKey } from "../../model";
import { judge, runScenario } from "./runner";
import { SCENARIOS } from "./scenarios";

const arg = (name: string): string | undefined => {
	const at = process.argv.indexOf(name);
	return at >= 0 ? process.argv[at + 1] : undefined;
};

const apiKey = readOpenRouterKey(process.env);
if (apiKey === undefined) {
	console.log(
		"staff evals: OPENROUTER_API_KEY is not set; skipping the live run (the replay runs in the test suite)",
	);
	process.exit(0);
}
const model =
	process.env.STAFF_EVAL_MODEL ?? process.env.PSI_GUIDE_MODEL ?? "anthropic/claude-sonnet-4.5";
const only = arg("--only")?.split(",");
const min = Number(arg("--min") ?? "0.9");
const chosen = SCENARIOS.filter((s) => only === undefined || only.includes(s.id));

let passed = 0;
const failures: Array<string> = [];
for (const sc of chosen) {
	const run = await runScenario(sc, { kind: "live", apiKey, model });
	const bad = judge(sc, run, true);
	if (bad.length === 0) passed += 1;
	else
		failures.push(
			`${sc.id}: ${bad.join("; ")}${process.argv.includes("--say") ? ` | said: ${run.text.slice(0, 200).replace(/\s+/g, " ")}` : ""}`,
		);
	console.log(`${bad.length === 0 ? "pass" : "FAIL"}  ${sc.id}`);
}
const rate = chosen.length === 0 ? 1 : passed / chosen.length;
console.log(`\n${passed}/${chosen.length} passed (${(rate * 100).toFixed(1)}%) on ${model}`);
for (const f of failures) console.log(`  ${f}`);
process.exit(rate >= min ? 0 : 1);
