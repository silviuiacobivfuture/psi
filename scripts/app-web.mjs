// The files of a WEB application (`pnpm new-app <name>`, the default kind): Vite + React +
// Tailwind on the platform's design system (@rmx/ui) and translations (@rmx/i18n), both taken
// BUILT from the installed SEB bundle (.seb-bundle/libs/npm/, which estate/platform.lock pins),
// never copied. Served by an unprivileged nginx from the estate's Harbor mirror.
//
// The estate's theme is its own: <BRAND_ASSETS_DIR>/estate.css, imported after the design
// system's tokens. Every user-facing string comes from a message namespace.

/** The SEB libraries a web application takes from the bundle (their names, until SEB renames them). */
export const WEB_LIBRARIES = ["@rmx/i18n", "@rmx/ui"];

/** A library's tarball in the bundle, named as SEB's tools/bundle/libs.mjs names it. */
export function tarball(/** @type {string} */ pkg) {
	return `${pkg.slice(1).replace("/", "-")}.tgz`;
}

/** A regular expression (as source text) matching the library's files under any node_modules. */
function underNodeModules(/** @type {string} */ pkg) {
	return `/[\\\\/]${pkg.split("/").join("[\\\\/]")}[\\\\/]/`;
}

/**
 * @param {{ name: string, slug: string, brandDir: string }} c
 * @returns {Record<string, string>}
 */
export function webAppFiles(c) {
	const { name, slug, brandDir } = c;
	const lib = (/** @type {string} */ file) => `file:../../.seb-bundle/libs/npm/${file}`;
	return {
		[`apps/${name}/package.json`]: `${JSON.stringify(
			{
				name: `@${slug}/${name}`,
				version: "0.0.0",
				private: true,
				type: "module",
				scripts: {
					dev: "vite",
					build: "tsc --noEmit && vite build",
					"type-check": "tsc --noEmit",
					test: "vitest run",
				},
				dependencies: {
					...Object.fromEntries(WEB_LIBRARIES.map((pkg) => [pkg, lib(tarball(pkg))])),
					react: "19.2.3",
					"react-dom": "19.2.3",
				},
				devDependencies: {
					"@tailwindcss/vite": "^4.1.0",
					"@testing-library/dom": "^10.4.0",
					"@testing-library/react": "^16.1.0",
					"@types/react": "^19.0.0",
					"@types/react-dom": "^19.0.0",
					"@vitejs/plugin-react": "^4.3.4",
					"axe-core": "^4.10.2",
					"happy-dom": "^20.1.0",
					tailwindcss: "^4.1.0",
					typescript: "^5.7.3",
					vite: "^6.0.7",
					vitest: "^2.1.9",
				},
			},
			null,
			"\t",
		)}\n`,
		[`apps/${name}/tsconfig.json`]: `${JSON.stringify(
			{
				extends: "../../tsconfig.base.json",
				compilerOptions: {
					jsx: "react-jsx",
					noEmit: true,
					types: ["vite/client"],
				},
				include: ["src", "vite.config.ts", "vitest.config.ts"],
			},
			null,
			"\t",
		)}\n`,
		[`apps/${name}/vite.config.ts`]: `import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react(), tailwind()],
});
`,
		// Apart from vite.config.ts: vitest 2 brings its own vite, whose types the build's do not match.
		[`apps/${name}/vitest.config.ts`]: `import { defineConfig } from "vitest/config";

export default defineConfig({
	esbuild: { jsx: "automatic" },
	test: {
		environment: "happy-dom",
		// The SEB libraries arrive built, as ES modules for a bundler: the suite runs them through
		// Vite as the build does, rather than handing them to Node.
		server: { deps: { inline: [${WEB_LIBRARIES.map(underNodeModules).join(", ")}] } },
		// Capped: a workstation runs other suites beside this one.
		minWorkers: 1,
		maxWorkers: 2,
	},
});
`,
		[`apps/${name}/index.html`]: `<!doctype html>
<html lang="ro" data-app="${name}">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>${name}</title>
	</head>
	<body>
		<div id="root"></div>
		<script type="module" src="/src/main.tsx"></script>
	</body>
</html>
`,
		[`apps/${name}/src/index.css`]: `@import "tailwindcss";
/* The design system: its tokens (light and dark), then where its classes are (Tailwind does not
 * look inside node_modules by itself). The application adds no token of its own. */
@import "@rmx/ui/tokens.css";
@import "@rmx/ui/sources.css";
/* The estate's theme (its per-application accents and mark tiles), after the design system's. */
@import "../../../${brandDir}/estate.css";
`,
		[`apps/${name}/src/main.tsx`]: `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app";
import "./index.css";

const root = document.getElementById("root");
if (root === null) throw new Error("index.html has no #root");
createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
`,
		[`apps/${name}/src/app.tsx`]: `import { common_action_continue, common_state_loading } from "@rmx/i18n/common";
import { Button } from "@rmx/ui";
import { type JSX, useState } from "react";

/** ${name}'s first screen: the design system's button, its words from a message namespace. */
export function App(): JSX.Element {
	const [busy, setBusy] = useState(false);
	return (
		<main className="bg-background text-foreground flex min-h-screen items-center justify-center">
			<Button onClick={() => setBusy(true)} disabled={busy}>
				{busy ? common_state_loading() : common_action_continue()}
			</Button>
		</main>
	);
}
`,
		[`apps/${name}/src/app.test.tsx`]: `import { common_action_continue, common_state_loading } from "@rmx/i18n/common";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./app";

afterEach(() => {
	cleanup();
	document.documentElement.classList.remove("dark");
});

/** WCAG 2.2 AA, the rules the platform commits to. */
async function violations(node: Element): Promise<string> {
	const r = await axe.run(node, {
		runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
	});
	return r.violations.map((v) => \`\${v.id}: \${v.help}\`).join("\\n");
}

describe("App", () => {
	it("shows the design system's button, labelled from the common namespace", () => {
		render(<App />);
		expect(screen.getByRole("button", { name: common_action_continue() })).toBeTruthy();
	});

	it("on click, says it is working and refuses a second click", () => {
		render(<App />);
		const button = screen.getByRole("button", { name: common_action_continue() });
		fireEvent.click(button);
		const busy = screen.getByRole("button", { name: common_state_loading() });
		expect(busy.hasAttribute("disabled")).toBe(true);
		expect(screen.queryByRole("button", { name: common_action_continue() })).toBeNull();
	});

	for (const theme of ["light", "dark"] as const) {
		it(\`passes axe (WCAG 2.2 AA) in the \${theme} theme\`, async () => {
			document.documentElement.classList.toggle("dark", theme === "dark");
			const { container } = render(<App />);
			expect(await violations(container)).toBe("");
		});
	}
});
`,
		[`apps/${name}/nginx.conf`]: `server {
	listen 8080;
	root /usr/share/nginx/html;
	location = /healthz { return 200 "ok"; }
	location / { try_files $uri /index.html; }
}
`,
		[`apps/${name}/Dockerfile`]: `# Built from the repository root, WITH the installed SEB bundle (.seb-bundle/: the design system
# and translations come from it): docker build -f apps/${name}/Dockerfile \\
#   --build-arg REGISTRY_HOST=… --build-arg REGISTRY_PROJECT_MIRROR=… .
# Base images come from the estate's Harbor mirror; there is no default registry.
ARG REGISTRY_HOST
ARG REGISTRY_PROJECT_MIRROR
FROM \${REGISTRY_HOST}/\${REGISTRY_PROJECT_MIRROR}/docker.io/library/node:24-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter @${slug}/${name}... && pnpm --filter @${slug}/${name} run build

FROM \${REGISTRY_HOST}/\${REGISTRY_PROJECT_MIRROR}/docker.io/nginxinc/nginx-unprivileged:1.27-alpine
COPY apps/${name}/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/${name}/dist /usr/share/nginx/html
EXPOSE 8080
`,
	};
}
