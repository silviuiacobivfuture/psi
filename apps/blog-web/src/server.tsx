import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { type Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import { brandFrom } from "./brands";
import { findArticle } from "./content/articles";
import { topicFrom } from "./content/topics";
import { AnswerTarget, AskSignals, questionFor, streamAnswer } from "./guide";
import type { Locale } from "./i18n";
import { ArticlePage } from "./pages/article";
import { IndexPage } from "./pages/index";
import { NotFoundPage } from "./pages/not-found";
import { rssFeed } from "./rss";
import { themeFrom } from "./theme";

const DATASTAR = readFileSync(fileURLToPath(import.meta.resolve("@psi/ui/datastar.js")), "utf8");
const PORT = Number.parseInt(process.env.PORT ?? "4340", 10);

export const app = new Hono({ strict: false });

const originOf = (c: Context): string => new URL(c.req.url).origin;

function notFound(c: Context, locale: Locale): Response | Promise<Response> {
	return c.html(
		<NotFoundPage locale={locale} theme={themeFrom(getCookie(c, "theme"))} origin={originOf(c)} />,
		404,
	);
}

app.get("/healthz", (c) => c.text("ok"));
app.get("/assets/datastar.js", (c) =>
	c.body(DATASTAR, 200, {
		"content-type": "text/javascript; charset=utf-8",
		"cache-control": "public, max-age=86400",
	}),
);
app.use("/assets/*", serveStatic({ root: "./public" }));
app.get("/favicon.svg", serveStatic({ path: "./public/favicon.svg" }));

for (const [locale, prefix, segment] of [
	["ro", "", "articole"],
	["en", "/en", "articles"],
] as const satisfies ReadonlyArray<readonly [Locale, string, string]>) {
	app.get(prefix === "" ? "/" : prefix, (c) =>
		c.html(
			<IndexPage
				locale={locale}
				theme={themeFrom(getCookie(c, "theme"))}
				origin={originOf(c)}
				brand={brandFrom(c.req.query("brand"))}
				topic={topicFrom(c.req.query("topic"))}
			/>,
		),
	);
	app.get(`${prefix}/${segment}/:slug`, (c) => {
		const article = findArticle(c.req.param("slug"));
		if (article === undefined) return notFound(c, locale);
		return c.html(
			<ArticlePage
				article={article}
				locale={locale}
				theme={themeFrom(getCookie(c, "theme"))}
				origin={originOf(c)}
			/>,
		);
	});
	app.get(`${prefix}/rss.xml`, (c) =>
		c.body(rssFeed(locale, originOf(c)), 200, {
			"content-type": "application/rss+xml; charset=utf-8",
		}),
	);
	app.post(`${prefix}/ghid`, async (c) => {
		const signals = AskSignals.safeParse(await c.req.json().catch(() => null));
		const target = AnswerTarget.parse(c.req.query("target"));
		const question = signals.success ? questionFor(target, signals.data) : null;
		if (question === null) return c.body(null, 204);
		return streamAnswer(c, locale, question, target);
	});
}

app.notFound((c) => notFound(c, c.req.path.startsWith("/en/") ? "en" : "ro"));

if (process.env.NODE_ENV !== "test") {
	serve({ fetch: app.fetch, port: PORT }, (info) =>
		console.log(`blog-web on http://localhost:${info.port}`),
	);
}
