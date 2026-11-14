import { serve } from "@hono/node-server";
import { guideSignal } from "@psi/site-control";
import { accountMemory, answerGuidePost, applyIndexingPolicy, installDevLog } from "@psi/ui";
import { Hono } from "hono";
import { contextStorage } from "hono/context-storage";
import { getCookie } from "hono/cookie";
import { account, bookingAccount, guideForRequest } from "./account";
import { registerAccountRoutes } from "./account-routes";
import { assets } from "./assets";
import { registerBooking } from "./booking-routes";
import { registerCmsRevalidate } from "./cms";
import { mountControl } from "./control";
import { ESTATE, SITE } from "./estate";
import { guideLabels } from "./guide";
import { guide, guideCounts } from "./guide-client";
import type { Locale } from "./i18n";
import { pageRegistry, pageResolver } from "./page-context";
import { HomePage } from "./pages/home";
import { registerPages } from "./pages/register";
import { registerPwa } from "./pwa/routes";
import { bookingHref } from "./routes";
import { sitemap } from "./seo";
import { themeFrom } from "./theme";

const PORT = Number.parseInt(process.env.PORT ?? "4330", 10);

export const app = new Hono({ strict: false });
// Before every other route and middleware: compression and page caching see each final response (assets.ts).
// Stylesheet, Datastar, fonts, images, the demo audio and the old site's workshop posters are served here.
assets.mount(app);
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
	registerBooking(app, locale);
	// What the compass reports about its invitation: opened, nudge shown, nudge clicked (counters only).
	app.post(`${prefix}/ghid/signal`, guideSignal({ reporter: guideCounts, locale }));
	// The guide: a question streams its answer; the compass also restores and resets its chat here.
	app.post(`${prefix}/ghid`, async (c) => {
		// Signed in: the in-chat form is pre-filled, and the guide remembers only with consent.
		const who = await bookingAccount(c, locale, bookingHref(locale));
		return answerGuidePost(c, {
			locale,
			labels: guideLabels(locale, {
				prefill: who.prefill,
				...(who.form === undefined ? {} : { account: who.form }),
			}),
			guide: () => guideForRequest(c, guide),
			memory: () => accountMemory(account, c, "hemisync"),
			page: pageResolver,
			warm: pageRegistry.ensure,
		});
	});
}
registerPages(app);

// The guide reads the site's other pages as the site renders them (an anonymous GET of its own app).
pageRegistry.connect((path) => app.request(path));

if (process.env.NODE_ENV !== "test") {
	serve({ fetch: app.fetch, port: PORT }, (info) =>
		console.log(`hemisync-web on http://localhost:${info.port}`),
	);
}
