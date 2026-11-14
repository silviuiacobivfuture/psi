import { sameOrigin } from "@psi/account";
import { caching, compression } from "@psi/delivery";
import type { StaffEngine } from "@psi/engine/staff";
import type { Pwa } from "@psi/pwa";
import { toastElement } from "@psi/ui/admin";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { assets } from "./assets";
import { assistantModeOf } from "./assistant/mode";
import { mountAssistant } from "./assistant/mount";
import { registerAudit } from "./audit/routes";
import type { Auth, Person } from "./auth";
import { Page } from "./chrome";
import { registerFloor } from "./floor/mount";
import { backPath } from "./lib/back";
import { canOf } from "./lib/can";
import { activeApp, type Ctx, viewerPrefs } from "./lib/context";
import { worstFailure } from "./lib/failures";
import { judge, landingFor } from "./lib/gates";
import { at } from "./lib/i18n";
import { sse } from "./lib/sse";
import { clearViewAs, readViewAs, type ViewAsState } from "./lib/view-as";
import { scopedPort } from "./lib/view-scope";
import { createNotifications } from "./notifications/mount";
import type { NotificationsPort } from "./notifications/port";
import { CalendarQuerySchema, renderCalendar } from "./pages/calendar";
import { registerClients } from "./pages/clients-routes";
import { registerDesign } from "./pages/design";
import { registerDetail } from "./pages/detail-routes";
import { registerEditor } from "./pages/editor-routes";
import { FailureState } from "./pages/failure";
import { NoAccessPage } from "./pages/gate";
import { registerLive } from "./pages/live";
import { MorePage } from "./pages/more";
import { registerMySettings } from "./pages/my-settings";
import { registerOrgAreas } from "./pages/org-areas";
import { registerOrgSettings } from "./pages/org-settings";
import { registerPlatform } from "./pages/platform";
import { registerPrint } from "./pages/print-routes";
import { registerReminders } from "./pages/reminders";
import { registerRequests } from "./pages/requests";
import { renderRoster } from "./pages/roster";
import { registerSearch } from "./pages/search";
import { registerSettings } from "./pages/settings";
import { registerViewAs } from "./pages/view-as";
import { m } from "./paraglide/messages.js";
import { PortError, type PortSource } from "./port/port";
import { AppSlugSchema } from "./port/schema";
import { registerProfile } from "./profile/routes";
import { registerRolesMatrix } from "./roles-matrix/page";
import { registerStats } from "./stats/routes";

export interface AppDeps {
	/** The port acting for the request's person (the scheduling service takes their own token). */
	ports: PortSource;
	/** Signs the "Vezi ca…" cookie. */
	viewAsSecret: string;
	auth: Auth;
	pwa: Pwa;
	origin: string;
	/** Where a person changes their name and e-mail: the sign-in's own account page. Absent: no link is offered. */
	ssoAccountUrl?: string;
	/** The bell's feed (Novu's inbox, or the development feed); omitted, there is no bell. */
	notifications?: NotificationsPort;
	/** The staff assistant; omitted, it does not exist (no button, no routes). */
	assistant?: StaffEngine;
	/** Extra mounts that need the app first (account routes, the PWA). */
	mount?: (app: Hono) => void;
}

export type Env = { Variables: { ctx: Ctx } };

/** The console: every page behind sign-in and an app membership; every write checked for its origin. */
export function createApp(deps: AppDeps): Hono<Env> {
	const root = new Hono({ strict: false });
	root.get("/healthz", (c) => c.text("ok"));
	assets.routes(root);
	deps.mount?.(root);
	const app = new Hono<Env>({ strict: false });
	// Pages, the stylesheet and Datastar travel brotli- or gzip-compressed (event streams never are: they must flush as
	// they go); a page that set no cache policy is revalidated by ETag, an unchanged asset asked again is a 304.
	app.use("*", compression());
	app.use("*", caching());
	const bell =
		deps.notifications === undefined
			? undefined
			: createNotifications(deps.notifications, deps.origin);
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
		const own = await deps.ports.forPerson(c);
		const memberships = await own.memberships(person.subject);
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
		// Who this person is and what they may do HERE, asked of the service for this request and never kept for the next.
		const real = await own.capabilities(person.subject, active);
		// "Vezi ca…" is the estate administrator's alone: an app's owners and admins never see or start it.
		const mayViewAs = real.platformAdmin;
		// A sign-in that only knows a subject (the development one) is named as the service names it.
		const self: Person =
			person.name === person.subject && real.displayName !== undefined
				? { ...person, name: real.displayName }
				: person;
		let port = own;
		let caps = real;
		let viewAs: ViewAsState | null = null;
		const wanted = await readViewAs(c, deps.viewAsSecret, person.subject, active);
		if (wanted !== null) {
			try {
				if (!mayViewAs) throw new PortError("forbidden", "estate administrators only");
				const flagged = await deps.ports.forPerson(c, wanted.as);
				caps = await flagged.capabilities(person.subject, active, wanted.as);
				port = scopedPort(flagged, caps);
				viewAs = wanted;
			} catch {
				clearViewAs(c);
			}
		}
		const can = canOf(caps, viewAs !== null);
		const assistantMode = await assistantModeOf(c, own, person.subject);
		c.set("ctx", {
			c,
			assistantMode,
			locale,
			pref,
			theme,
			deco,
			person: self,
			platformAdmin: real.platformAdmin,
			app: active,
			memberships,
			port,
			caps,
			can,
			viewAs,
			mayViewAs,
			pwa: deps.pwa,
			...(deps.assistant === undefined ? {} : { assistant: deps.assistant }),
			...(bell === undefined ? {} : { notifications: bell }),
			signOut: deps.auth.signOutAction,
		});
		const verdict = judge(c.req.method, c.req.path, can);
		if (verdict === "forbidden") throw new PortError("forbidden", c.req.path);
		if (verdict === "read-only") {
			const text = m.view_as_readonly({}, at(locale));
			if (c.req.header("datastar-request") === "true")
				return sse((stream) => {
					stream.patchElements(toastElement(text, m.dismiss({}, at(locale))));
				});
			return c.text(text, 403);
		}
		await next();
		// The service no longer accepts the person's token: through sign-in and back, never a dead end.
		if (worstFailure(c)?.code === "unauthenticated")
			c.res = c.redirect(
				deps.auth.signInHref(`${new URL(c.req.url).pathname}${new URL(c.req.url).search}`),
				302,
			);
	});

	if (deps.auth.signOutAction === "/dev-signout")
		app.post("/dev-signout", (c) => c.redirect("/", 303));

	app.get("/switch/:slug", (c) => {
		const slug = AppSlugSchema.safeParse(c.req.param("slug"));
		const ctx = c.var.ctx;
		if (slug.success && ctx.memberships.some((x) => x.app === slug.data))
			setCookie(c, "app", slug.data, { path: "/", maxAge: 31536000, sameSite: "Lax" });
		return c.redirect(landingFor(c.var.ctx.can), 302);
	});

	app.get("/", (c) => c.redirect(landingFor(c.var.ctx.can), 302));
	app.get("/calendar", async (c) =>
		c.html(await renderCalendar(c.var.ctx, CalendarQuerySchema.parse(c.req.query())), 200, {
			"cache-control": "private, no-store",
		}),
	);
	registerEditor(app);
	registerPrint(app);
	registerDetail(app);
	if (deps.assistant !== undefined) mountAssistant(app, deps.assistant);
	bell?.register(app);
	registerFloor(app);
	registerSearch(app);
	registerClients(app);
	registerRequests(app);
	registerLive(app);
	registerViewAs(app, deps);
	registerDesign(app);
	registerOrgSettings(app);
	registerSettings(app);
	registerAudit(app);
	registerOrgAreas(app);
	registerMySettings(app);
	registerPlatform(app);
	registerStats(app);
	registerProfile(app, deps);
	registerRolesMatrix(app);
	registerReminders(app);
	app.get("/roster", async (c) =>
		c.html(await renderRoster(c.var.ctx, c.req.query("date")), 200, {
			"cache-control": "private, no-store",
		}),
	);
	app.get("/more", async (c) =>
		c.html(await MorePage(c.var.ctx), 200, { "cache-control": "private, no-store" }),
	);
	app.onError(async (err, c) => {
		if (!(err instanceof PortError)) throw err;
		if (err.code === "unauthenticated")
			return c.redirect(
				deps.auth.signInHref(`${new URL(c.req.url).pathname}${new URL(c.req.url).search}`),
				302,
			);
		const status = {
			forbidden: 403,
			"not-found": 404,
			"rate-limited": 429,
			"not-available-yet": 200,
			conflict: 409,
			invalid: 400,
			unavailable: 503,
		} as const;
		const ctx = c.var.ctx;
		if (ctx === undefined) return c.text(err.code, status[err.code]);
		if (c.req.header("datastar-request") === "true") return c.text(err.code, status[err.code]);
		return c.html(
			await Page({
				ctx,
				current: "more",
				title: m.brand({}, at(ctx.locale)),
				children: (
					<div class="adm-page">
						<FailureState error={err} locale={ctx.locale} />
					</div>
				),
			}),
			status[err.code],
			{ "cache-control": "private, no-store" },
		);
	});
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
