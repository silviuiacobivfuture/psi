import { mountPushHook } from "@psi/notify/push";
import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { account } from "../account";
import { at, base } from "../i18n";
import { PageShell } from "../pages/shell";
import { m } from "../paraglide/messages.js";
import { themeFrom } from "../theme";
import { notificationsPath, novu, pwa } from "./site";

/**
 * The PWA's routes on Psizone: manifest, worker, offline pages and push API (`pwa.mount`), and
 * /cont/notificari — open to anyone (article news needs no account), never cached. Booking pushes
 * find the person by the account hash the booking routes store with each request
 * (docs/plans/pwa.md §Bookings).
 */
export function registerPwa(app: Hono): void {
	pwa.mount(app);
	// Novu's Push Webhook (it signs every call): a client's booking pushes reach their devices on this site.
	mountPushHook(app, pwa, novu, "psizone");
	for (const locale of ["ro", "en"] as const) {
		app.get(notificationsPath(locale), account.recognise(), async (c) => {
			const o = at(locale);
			const subject = account.current(c)?.subject ?? null;
			return c.html(
				<PageShell
					locale={locale}
					theme={themeFrom(getCookie(c, "theme"))}
					origin={new URL(c.req.url).origin}
					path="/cont/notificari"
					title={m.pwa_page_title({}, o)}
					lead={m.pwa_page_lead({}, o)}
					back={{ label: m.account_nav({}, o), href: `${base(locale)}/cont` }}
				>
					<section class="mx-auto max-w-3xl px-5 pb-28">
						{pwa.notifications({
							locale,
							signedIn: subject !== null,
							signInHref: account.signInHref(notificationsPath(locale)),
							devices: await pwa.devices(subject),
						})}
					</section>
				</PageShell>,
				200,
				{ "cache-control": "private, no-store" },
			);
		});
	}
}
