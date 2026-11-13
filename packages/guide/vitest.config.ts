import { defineConfig } from "vitest/config";

/** Tests are capped (repo rule): one worker floor so `--maxWorkers=2` never conflicts with the default minimum. */
export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
		// No key, no network beyond this machine: only the in-process fake provider answers.
		setupFiles: ["../../.mono/vitest/hermetic.ts"],
		minWorkers: 1,
		maxWorkers: 2,
		testTimeout: 20_000,
	},
});
