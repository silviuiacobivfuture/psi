import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { judge, runScenario } from "../evals/runner";
import { SCENARIOS } from "../evals/scenarios";
import { STAFF_TOOLS } from "../tool-ids";

beforeEach(() => vi.stubEnv("OPENROUTER_API_KEY", ""));
afterEach(() => vi.unstubAllEnvs());

describe("the evaluation set", () => {
	it("has at least forty scenarios with unique ids, in both languages and for every kind of person", () => {
		expect(SCENARIOS.length).toBeGreaterThanOrEqual(40);
		expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
		expect(new Set(SCENARIOS.map((s) => s.lang))).toEqual(new Set(["ro", "en"]));
		expect(new Set(SCENARIOS.map((s) => s.by))).toEqual(
			new Set(["reception", "therapist", "owner"]),
		);
		expect(SCENARIOS.filter((s) => s.lang === "ro").length).toBeGreaterThan(SCENARIOS.length / 2);
	});

	it("only names tools that exist, and every tool is exercised by at least one scenario", () => {
		const used = new Set(
			SCENARIOS.flatMap((s) => [...s.script.map((m) => m.tool), ...s.mustCall.flat()]),
		);
		for (const key of used) expect(Object.keys(STAFF_TOOLS)).toContain(key);
		const unused = Object.keys(STAFF_TOOLS).filter(
			(k) => k !== "api" && !used.has(k as keyof typeof STAFF_TOOLS),
		);
		expect(unused).toEqual([]);
	});

	it("covers the refusals: a missing permission, a stranger's instructions, an off-topic ask, two people with one name", () => {
		const ids = SCENARIOS.map((s) => s.id);
		for (const id of [
			"no-permission-cancel",
			"no-permission-search",
			"injection-in-request",
			"off-topic",
			"two-andrei",
		])
			expect(ids).toContain(id);
	});
});

describe("replaying the right trajectory ends as each scenario says (CI-safe: the provider is faked)", () => {
	it.each(SCENARIOS.map((s) => [s.id, s] as const))("%s", async (_id, scenario) => {
		const run = await runScenario(scenario, { kind: "replay" });
		expect(judge(scenario, run, false)).toEqual([]);
	});

	it("the judge can fail: a wrong trajectory is reported", async () => {
		const first = SCENARIOS[0];
		if (first === undefined) throw new Error("no scenarios");
		const run = await runScenario({ ...first, script: [] }, { kind: "replay" });
		expect(judge(first, run, false).length).toBeGreaterThan(0);
	});
});
