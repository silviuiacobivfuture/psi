import { defineConfig } from "vitest/config";

/** Tests are capped (repo rule); the Convex race test needs the local backend (README). */
export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
		minWorkers: 1,
		maxWorkers: 2,
		testTimeout: 30_000,
		hookTimeout: 60_000,
	},
});
