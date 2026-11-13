import { defineConfig } from "vitest/config";

/** Tests are capped (repo rule). The browser suites launch a real Chromium and are slower. */
export default defineConfig({
	test: {
		include: ["src/**/*.test.{ts,tsx}"],
		minWorkers: 1,
		maxWorkers: 2,
		testTimeout: 120000,
		hookTimeout: 60000,
	},
});
