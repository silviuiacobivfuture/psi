import { serve } from "@hono/node-server";
import { guideSignal } from "@psi/site-control";
import {
	accountMemory,
	answerGuidePost,
	applyIndexingPolicy,
	installDevLog,
	registerBookingSubmit,
	scheduleOf,
} from "@psi/ui";
import { Hono } from "hono";
import { contextStorage } from "hono/context-storage";
import { getCookie } from "hono/cookie";
import { account } from "./account";
import { registerAccountRoutes } from "./account-routes";
import { assets } from "./assets";
import { bookingAccount, guideForRequest } from "./booking-account";
import { registerBookingRoutes } from "./booking-routes";
import { bookingDeps } from "./booking-store";
import { registerCmsRevalidate } from "./cms";
import { registerContentPages } from "./content-routes";
import { mountControl } from "./control";
import { ESTATE, SITE } from "./estate";
import { guideLabels } from "./guide";
import { guide, guideCounts } from "./guide-client";
import { at, type Locale } from "./i18n";
import { pageRegistry, pageResolver } from "./page-context";
import { ContactPage } from "./pages/contact";
import { HomePage } from "./pages/home";
import { PreparingPage, TeamPage } from "./pages/simple";
import { StoryPage } from "./pages/story";
import { m } from "./paraglide/messages.js";
import { registerPwa } from "./pwa/routes";
import { sitemap } from "./seo";
import { themeFrom } from "./theme";

const PORT = Number.parseInt(process.env.PORT ?? "4310", 10);

export const app = new Hono({ strict: false });
// Before every other route and middleware: compression and page caching see each final response (assets.ts).
// Stylesheet, Datastar, fonts, brand images and the old site's photographs (public/images/old-site) are served here.
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
	registerContentPages(app, locale, prefix);
	registerAccountRoutes(app, locale);
	app.get(`${prefix}/povestea`, (c) =>
		c.html(
			<StoryPage
				locale={locale}
				theme={themeFrom(getCookie(c, "theme"))}
				origin={new URL(c.req.url).origin}
			/>,
		),
	);
	app.get(`${prefix}/echipa`, (c) =>
		c.html(
			<TeamPage
				locale={locale}
				theme={themeFrom(getCookie(c, "theme"))}
				origin={new URL(c.req.url).origin}
				path="/echipa"
			/>,
		),
	);
	for (const [path, title] of [
		["/confidentialitate", m.privacy_title({}, at(locale))],
		["/politica-editoriala", m.editorial_title({}, at(locale))],
	] as const) {
		app.get(`${prefix}${path}`, (c) =>
			c.html(
				<PreparingPage
					locale={locale}
					theme={themeFrom(getCookie(c, "theme"))}
					origin={new URL(c.req.url).origin}
					path={path}
					title={title}
				/>,
			),
		);
	}
	registerBookingRoutes(app, locale, prefix);
	app.get(`${prefix}/contact`, async (c) => {
		const origin = new URL(c.req.url).origin;
		const who = await bookingAccount(c, locale, `${prefix}/contact`);
		const schedule = await scheduleOf(bookingDeps.picker, {});
		c.header("cache-control", "private, no-store");
		return c.html(
			<ContactPage
				locale={locale}
				theme={themeFrom(getCookie(c, "theme"))}
				origin={origin}
				{...(schedule === undefined ? {} : { schedule })}
				booking={{
					values: who.prefill,
					...(who.form === undefined ? {} : { account: who.form }),
				}}
			/>,
		);
	});
	registerBookingSubmit(app, bookingDeps, locale);
	// What the compass reports about its invitation: opened, nudge shown, nudge clicked (counters only).
	app.post(`${prefix}/ghid/signal`, guideSignal({ reporter: guideCounts, locale }));
	// The guide: a question streams its answer; the compass also restores and resets its chat here.
	app.post(`${prefix}/ghid`, async (c) => {
		// Signed in: the in-chat form is pre-filled, and the guide remembers only with consent.
		const who = await bookingAccount(c, locale, `${prefix}/contact`);
		return answerGuidePost(c, {
			locale,
			labels: guideLabels(locale, {
				prefill: who.prefill,
				...(who.form === undefined ? {} : { account: who.form }),
			}),
			guide: () => guideForRequest(c, guide),
			memory: () => accountMemory(account, c, "psizone"),
			page: pageResolver,
			warm: pageRegistry.ensure,
		});
	});
}

// The guide reads the site's other pages as the site renders them (an anonymous GET of its own app).
pageRegistry.connect((path) => app.request(path));

if (process.env.NODE_ENV !== "test") {
	serve({ fetch: app.fetch, port: PORT }, (info) =>
		console.log(`psizone-web on http://localhost:${info.port}`),
	);
}
