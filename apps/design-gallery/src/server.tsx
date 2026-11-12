import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Doctype } from "@psi/ui";
import { Hono } from "hono";
import type { Locale } from "./i18n";
import { m } from "./paraglide/messages.js";
import { ThemePanel } from "./theme-panel";
import { THEMES } from "./themes";

// Resolved through require so it works the same under Node and under the test runner.
const DATASTAR = readFileSync(
	createRequire(import.meta.url).resolve("@psi/ui/datastar.js"),
	"utf8",
);
const PORT = Number.parseInt(process.env.PORT ?? "4300", 10);
const FONTS =
	"https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,100..900,0..100;1,9..144,100..900,0..100&family=Manrope:wght@400..800&family=Inter:wght@400..700&family=IBM+Plex+Mono:wght@400;500;600&display=swap";

export const app = new Hono({ strict: false });

app.get("/healthz", (c) => c.text("ok"));
app.get("/assets/datastar.js", (c) =>
	c.body(DATASTAR, 200, { "content-type": "text/javascript; charset=utf-8" }),
);
app.use("/assets/*", serveStatic({ root: "./public" }));
app.get("/favicon.svg", serveStatic({ path: "./public/favicon.svg" }));

for (const [locale, path] of [
	["ro", "/"],
	["en", "/en"],
] as const satisfies ReadonlyArray<readonly [Locale, string]>) {
	app.get(path, (c) =>
		c.html(
			<>
				<Doctype />
				<html lang={locale} data-theme="psizone-dark">
					<head>
						<meta charset="utf-8" />
						<meta name="viewport" content="width=device-width, initial-scale=1" />
						<title>{m.title({}, { locale })}</title>
						<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
						<link rel="stylesheet" href={FONTS} />
						<link rel="stylesheet" href="/assets/app.css" />
						<script type="module" src="/assets/datastar.js" />
					</head>
					<body class="pz-grain">
						<header class="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-xl">
							<div class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3">
								<span class="pz-display text-headline">{m.title({}, { locale })}</span>
								<nav class="flex flex-wrap gap-2" aria-label={m.jump({}, { locale })}>
									{THEMES.map((t) => (
										<a class="pz-chip" href={`#${t.id}`}>
											{t.name}
										</a>
									))}
								</nav>
							</div>
						</header>
						<p class="mx-auto max-w-6xl px-5 py-6 text-body-sm text-ink-muted">
							{m.lead({}, { locale })}
						</p>
						<main>
							{THEMES.map((t) => (
								<ThemePanel id={t.id} name={t.name} locale={locale} />
							))}
						</main>
					</body>
				</html>
			</>,
		),
	);
}

if (process.env.NODE_ENV !== "test") {
	serve({ fetch: app.fetch, port: PORT }, (info) =>
		console.log(`design-gallery on http://localhost:${info.port}`),
	);
}
