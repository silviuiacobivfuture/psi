import { defineConfig } from "vitest/config";

/** Tests are capped (repo rule): a one-worker floor so `--maxWorkers=2` never conflicts with the default minimum. */
export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
		// No key, no network beyond this machine: only in-process fakes answer.
		setupFiles: ["../../.mono/vitest/hermetic.ts"],
		minWorkers: 1,
		maxWorkers: 2,
		testTimeout: 30_000,
	},
});
