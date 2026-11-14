import { defineConfig } from "vitest/config";

/** Tests are capped (repo rule): one worker floor so `--maxWorkers=2` never conflicts with the default minimum. */
export default defineConfig({
	test: {
		include: [
			"reconcile-authz/**/*.test.ts",
			"reseed-roles/**/*.test.ts",
			"apply-org/**/*.test.ts",
		],
		minWorkers: 1,
		maxWorkers: 2,
		testTimeout: 30_000,
	},
});
