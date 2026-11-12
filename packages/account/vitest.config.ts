import { defineConfig } from "vitest/config";

/** Tests are capped (repo rule): a one-worker floor so `--maxWorkers=2` never conflicts with the default minimum. */
export default defineConfig({
	test: {
		include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
		minWorkers: 1,
		maxWorkers: 2,
		testTimeout: 20_000,
	},
});
