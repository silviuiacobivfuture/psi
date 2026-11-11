import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { AskBody, streamAnswer } from "./guide";
import type { Locale } from "./i18n";
import { HomePage } from "./pages/home";
import { themeFrom } from "./theme";

const DATASTAR = readFileSync(fileURLToPath(import.meta.resolve("@psi/ui/datastar.js")), "utf8");
const PORT = Number.parseInt(process.env.PORT ?? "4310", 10);

export const app = new Hono();

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
		const parsed = AskBody.safeParse(await c.req.json().catch(() => null));
		if (!parsed.success) return c.body(null, 204);
		return streamAnswer(c, locale, parsed.data.question);
	});
}

if (process.env.NODE_ENV !== "test") {
	serve({ fetch: app.fetch, port: PORT }, (info) =>
		console.log(`psizone-web on http://localhost:${info.port}`),
	);
}
