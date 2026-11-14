import { defineConfig } from "vitest/config";

/** Tests are capped (repo rule): a one-worker floor so `--maxWorkers=2` never conflicts with the default minimum. */
export default defineConfig({
	test: {
		include: ["src/**/*.test.{ts,tsx}"],
		minWorkers: 1,
		maxWorkers: 2,
	},
});
