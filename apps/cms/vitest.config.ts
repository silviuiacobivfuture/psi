import { defineConfig } from "vitest/config";

export default defineConfig({
	// The admin views' components render to markup in tests: React's automatic JSX runtime, and
	// Payload's packages (which import stylesheets) are bundled by Vite instead of loaded by Node.
	esbuild: { jsx: "automatic" },
	test: {
		include: ["src/**/*.test.ts"],
		// No key, no network beyond this machine: only in-process fakes answer.
		setupFiles: ["../../.mono/vitest/hermetic.ts"],
		maxWorkers: 2,
		minWorkers: 1,
		server: { deps: { inline: [/@payloadcms/, /react-image-crop/] } },
	},
});
