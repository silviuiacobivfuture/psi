import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { accountMemory, answerGuidePost, applyIndexingPolicy, installDevLog } from "@psi/ui";
import { Hono } from "hono";
import { contextStorage } from "hono/context-storage";
import { getCookie } from "hono/cookie";
import { account, guideForRequest } from "./account";
import { registerAccountRoutes } from "./account-routes";
import { registerCmsRevalidate } from "./cms";
import { mountControl } from "./control";
import { ESTATE, SITE } from "./estate";
import { guideLabels } from "./guide";
import { guide } from "./guide-client";
import type { Locale } from "./i18n";
import { pageResolver } from "./page-context";
import { HomePage } from "./pages/home";
import { registerPages } from "./pages/register";
import { registerPwa } from "./pwa/routes";
import { sitemap } from "./seo";
import { themeFrom } from "./theme";

const DATASTAR = readFileSync(fileURLToPath(import.meta.resolve("@psi/ui/datastar.js")), "utf8");
const PORT = Number.parseInt(process.env.PORT ?? "4330", 10);

export const app = new Hono({ strict: false });
installDevLog(app);
applyIndexingPolicy(app, process.env, {
	sitemap: `${ESTATE[SITE]}/sitemap.xml`,
});
app.use(contextStorage());
// The estate account: /auth/* (sign-in, callback, sign-out, back-channel logout); /cont below.
account.mount(app);
// The installable app and its notifications (docs/plans/pwa.md): manifest, /sw.js, push API, /cont/notificari.
registerPwa(app);
// The control plane (the CMS's /admin/platform): signed /__control/*, /admin → there, the Compass's staff link.
mountControl(app);
app.get("/sitemap.xml", async (c) =>
	c.body(await sitemap(app), 200, {
		"content-type": "application/xml; charset=utf-8",
		"cache-control": "public, max-age=3600",
	}),
);

app.get("/healthz", (c) => c.text("ok"));
// The shared CMS's signed webhook: published prices refresh at once (cms.ts).
registerCmsRevalidate(app);
app.get("/assets/datastar.js", (c) =>
	c.body(DATASTAR, 200, {
		"content-type": "text/javascript; charset=utf-8",
		"cache-control": "public, max-age=86400",
	}),
);
app.get("/favicon.svg", serveStatic({ path: "./public/favicon.svg" }));
app.use("/assets/*", serveStatic({ root: "./public" }));
// The old site's workshop posters and archive images (public/images/old-site).
app.use("/images/*", serveStatic({ root: "./public" }));

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
	registerAccountRoutes(app, locale);
	// The guide: a question streams its answer; the compass also restores and resets its chat here.
	app.post(`${prefix}/ghid`, (c) =>
		answerGuidePost(c, {
			locale,
			labels: guideLabels(locale),
			guide: () => guideForRequest(c, guide),
			memory: () => accountMemory(account, c, "hemisync"),
			page: pageResolver,
		}),
	);
}
registerPages(app);

if (process.env.NODE_ENV !== "test") {
	serve({ fetch: app.fetch, port: PORT }, (info) =>
		console.log(`hemisync-web on http://localhost:${info.port}`),
	);
}
