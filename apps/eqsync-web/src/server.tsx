import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import {
	applyIndexingPolicy,
	parseAnswerTarget,
	parseAskSignals,
	questionFor,
	streamGuideAnswer,
} from "@psi/ui";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { ANSWER_CLASS, guideLabels } from "./guide";
import { guide } from "./guide-client";
import type { Locale } from "./i18n";
import { HomePage } from "./pages/home";
import { themeFrom } from "./theme";

const DATASTAR = readFileSync(fileURLToPath(import.meta.resolve("@psi/ui/datastar.js")), "utf8");
const PORT = Number.parseInt(process.env.PORT ?? "4320", 10);

export const app = new Hono({ strict: false });
applyIndexingPolicy(app);

app.get("/healthz", (c) => c.text("ok"));
app.get("/assets/datastar.js", (c) =>
	c.body(DATASTAR, 200, {
		"content-type": "text/javascript; charset=utf-8",
		"cache-control": "public, max-age=86400",
	}),
);
app.use("/assets/*", serveStatic({ root: "./public" }));

for (const [locale, prefix] of [
	["ro", ""],
	["en", "/en"],
] as const satisfies ReadonlyArray<readonly [Locale, string]>) {
	app.get(prefix === "" ? "/" : prefix, (c) => {
		const origin = new URL(c.req.url).origin;
		return c.html(
			<HomePage locale={locale} theme={themeFrom(getCookie(c, "theme"))} origin={origin} />,
		);
	});
	app.post(`${prefix}/ghid`, async (c) => {
		const signals = parseAskSignals(await c.req.json().catch(() => null));
		const target = parseAnswerTarget(c.req.query("target"));
		const question = signals === null ? null : questionFor(target, signals);
		if (question === null) return c.body(null, 204);
		return streamGuideAnswer(c, {
			guide,
			locale,
			question,
			target,
			labels: guideLabels(locale),
			class: ANSWER_CLASS,
		});
	});
}

if (process.env.NODE_ENV !== "test") {
	serve({ fetch: app.fetch, port: PORT }, (info) =>
		console.log(`eqsync-web on http://localhost:${info.port}`),
	);
}
