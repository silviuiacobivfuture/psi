import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { guideSignal } from "@psi/site-control";
import { accountMemory, answerGuidePost, applyIndexingPolicy, installDevLog } from "@psi/ui";
import { type Context, Hono } from "hono";
import { contextStorage } from "hono/context-storage";
import { getCookie } from "hono/cookie";
import { account, guideForRequest } from "./account";
import { registerAccountRoutes } from "./account-routes";
import { countingGuide, guideCounts, trackable } from "./analytics/index";
import { brandFrom } from "./brands";
import { registerCmsRoutes, startCms } from "./cms-routes";
import { findArticle } from "./content/articles";
import { pageFrom, shelfFrom } from "./content/shelves";
import { topicFrom } from "./content/topics";
import { mountControl } from "./control";
import { ESTATE, SITE } from "./estate";
import { guideLabels } from "./guide";
import { guide } from "./guide-client";
import type { Locale } from "./i18n";
import { pageRegistry, pageResolver } from "./page-context";
import { ArticlePage } from "./pages/article";
import { IndexPage } from "./pages/index";
import { NotFoundPage } from "./pages/not-found";
import { registerPwa } from "./pwa/routes";
import { rssFeed } from "./rss";
import { sitemap } from "./seo";
import { themeFrom } from "./theme";

const DATASTAR = readFileSync(fileURLToPath(import.meta.resolve("@psi/ui/datastar.js")), "utf8");
const PORT = Number.parseInt(process.env.PORT ?? "4340", 10);

export const app = new Hono({ strict: false });
installDevLog(app);
applyIndexingPolicy(app, process.env, {
	sitemap: `${ESTATE[SITE]}/sitemap.xml`,
});
app.use(contextStorage());
// The estate account: /auth/* (sign-in, callback, sign-out, back-channel logout); pages below.
account.mount(app);
// The installable app and its notifications (docs/plans/pwa.md); before the CMS routes, so a publish is announced.
registerPwa(app);
// The control plane (the CMS's /admin/platform): signed /__control/*, /admin → there, the Compass's staff link.
mountControl(app);
app.get("/sitemap.xml", async (c) =>
	c.body(await sitemap(app), 200, {
		"content-type": "application/xml; charset=utf-8",
		"cache-control": "public, max-age=3600",
	}),
);

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
// The shared CMS: revalidation webhook, live preview, reading beacon (cms-routes.ts).
registerCmsRoutes(app);

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
				shelf={shelfFrom(c.req.query("shelf"))}
				page={pageFrom(c.req.query("page"))}
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
				beacon={trackable(c)}
			/>,
		);
	});
	app.get(`${prefix}/rss.xml`, (c) =>
		c.body(rssFeed(locale, originOf(c)), 200, {
			"content-type": "application/rss+xml; charset=utf-8",
		}),
	);
	// One feed per brand: /rss/psizone.xml, /en/rss/eqsync.xml, …
	app.get(`${prefix}/rss/:feed{[a-z]+\\.xml}`, (c) => {
		const brand = brandFrom(c.req.param("feed").replace(/\.xml$/, ""));
		if (brand === undefined) return notFound(c, locale);
		return c.body(rssFeed(locale, originOf(c), brand), 200, {
			"content-type": "application/rss+xml; charset=utf-8",
		});
	});
	registerAccountRoutes(app, locale, prefix);
	// What the compass reports about its invitation: opened, nudge shown, nudge clicked (counters only).
	app.post(`${prefix}/ghid/signal`, guideSignal({ reporter: guideCounts, locale }));
	// The guide: a question streams its answer; the compass also restores and resets its chat here.
	app.post(`${prefix}/ghid`, (c) =>
		answerGuidePost(c, {
			locale,
			labels: guideLabels(locale),
			guide: async () => countingGuide(await guideForRequest(c, guide), locale, trackable(c)),
			memory: () => accountMemory(account, c, "blog"),
			page: pageResolver,
			warm: pageRegistry.ensure,
		}),
	);
}

app.notFound((c) => notFound(c, c.req.path.startsWith("/en/") ? "en" : "ro"));

// The guide reads the site's other pages as the site renders them (an anonymous GET of its own app).
pageRegistry.connect((path) => app.request(path));

if (process.env.NODE_ENV !== "test") {
	await startCms();
	serve({ fetch: app.fetch, port: PORT }, (info) =>
		console.log(`blog-web on http://localhost:${info.port}`),
	);
}
