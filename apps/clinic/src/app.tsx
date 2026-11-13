import { sameOrigin } from "@psi/account";
import type { Pwa } from "@psi/pwa";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { registerAssets } from "./assets";
import type { Auth } from "./auth";
import { Page } from "./chrome";
import { activeApp, type Ctx, viewerPrefs } from "./lib/context";
import { at } from "./lib/i18n";
import { renderAudit } from "./pages/audit";
import { CalendarQuerySchema, renderCalendar } from "./pages/calendar";
import { registerCalendarWrites } from "./pages/calendar-routes";
import { registerClients } from "./pages/clients-routes";
import { registerDesign } from "./pages/design";
import { NoAccessPage } from "./pages/gate";
import { MorePage } from "./pages/more";
import { registerReminders } from "./pages/reminders";
import { registerRequests } from "./pages/requests";
import { renderRoster } from "./pages/roster";
import { registerSearch } from "./pages/search";
import { registerSettings } from "./pages/settings";
import { m } from "./paraglide/messages.js";
import type { ClinicPort } from "./port/port";
import { AppSlugSchema } from "./port/schema";

export interface AppDeps {
	port: ClinicPort;
	auth: Auth;
	pwa: Pwa;
	origin: string;
	/** Extra mounts that need the app first (account routes, the PWA). */
	mount?: (app: Hono) => void;
}

export type Env = { Variables: { ctx: Ctx } };

/** The console: every page behind sign-in and an app membership; every write checked for its origin. */
export function createApp(deps: AppDeps): Hono<Env> {
	const root = new Hono({ strict: false });
	root.get("/healthz", (c) => c.text("ok"));
	registerAssets(root);
	deps.mount?.(root);
	const app = new Hono<Env>({ strict: false });
	app.route("/", root);

	// Writes only from this console's own origin.
	app.use("*", async (c, next) => {
		if (!sameOrigin(c.req.raw.headers, c.req.method, deps.origin)) return c.text("forbidden", 403);
		await next();
	});

	// Preferences work signed out too (the sign-in page honours them).
	app.post("/prefs", async (c) => {
		const body = await c.req.parseBody();
		const opt = { path: "/", maxAge: 31536000, sameSite: "Lax" as const };
		if (body.theme === "light" || body.theme === "dark" || body.theme === "system")
			setCookie(c, "theme", body.theme, opt);
		if (body.lang === "ro" || body.lang === "en") setCookie(c, "lang", body.lang, opt);
		if (body.deco === "on" || body.deco === "off") setCookie(c, "deco", body.deco, opt);
		return c.redirect(backPath(c.req.header("referer"), c.req.url), 303);
	});

	app.use("*", async (c, next) => {
		const { locale, pref, theme, deco } = viewerPrefs(c);
		const person = await deps.auth.person(c);
		if (person === null)
			return c.redirect(
				deps.auth.signInHref(`${new URL(c.req.url).pathname}${new URL(c.req.url).search}`),
				302,
			);
		const memberships = await deps.port.memberships(person.subject);
		const active = activeApp(c, memberships);
		if (active === null) {
			return c.html(
				<NoAccessPage
					locale={locale}
					theme={theme}
					name={person.name}
					signOutAction={deps.auth.signOutAction}
				/>,
				403,
				{ "cache-control": "private, no-store" },
			);
		}
		c.set("ctx", {
			c,
			locale,
			pref,
			theme,
			deco,
			person,
			app: active,
			memberships,
			port: deps.port,
			pwa: deps.pwa,
			signOut: deps.auth.signOutAction,
		});
		await next();
	});

	if (deps.auth.signOutAction === "/dev-signout")
		app.post("/dev-signout", (c) => c.redirect("/", 303));

	app.get("/switch/:slug", (c) => {
		const slug = AppSlugSchema.safeParse(c.req.param("slug"));
		const ctx = c.var.ctx;
		if (slug.success && ctx.memberships.some((x) => x.app === slug.data))
			setCookie(c, "app", slug.data, { path: "/", maxAge: 31536000, sameSite: "Lax" });
		return c.redirect("/calendar", 302);
	});

	app.get("/", (c) => c.redirect("/calendar", 302));
	app.get("/calendar", async (c) =>
		c.html(await renderCalendar(c.var.ctx, CalendarQuerySchema.parse(c.req.query())), 200, {
			"cache-control": "private, no-store",
		}),
	);
	registerCalendarWrites(app, deps);
	registerSearch(app);
	registerClients(app);
	registerRequests(app);
	registerDesign(app);
	registerSettings(app);
	app.get("/audit", async (c) =>
		c.html(await renderAudit(c.var.ctx), 200, { "cache-control": "private, no-store" }),
	);
	registerReminders(app);
	app.get("/roster", async (c) =>
		c.html(await renderRoster(c.var.ctx, c.req.query("date")), 200, {
			"cache-control": "private, no-store",
		}),
	);
	app.get("/more", async (c) =>
		c.html(await MorePage(c.var.ctx), 200, { "cache-control": "private, no-store" }),
	);
	app.notFound(async (c) => {
		const ctx = c.var.ctx;
		return c.html(
			await Page({
				ctx,
				current: "more",
				title: "404",
				children: <p class="adm-muted">{m.error_title({}, at(ctx.locale))}</p>,
			}),
			404,
		);
	});
	return app;
}

function backPath(referer: string | undefined, here: string): string {
	try {
		const r = new URL(referer ?? "", here);
		return r.origin === new URL(here).origin ? `${r.pathname}${r.search}` : "/";
	} catch {
		return "/";
	}
}
