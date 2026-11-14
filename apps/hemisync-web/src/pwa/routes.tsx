import { mountPushHook } from "@psi/notify/push";
import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { account } from "../account";
import { at } from "../i18n";
import { AccountFrame } from "../pages/account";
import { m } from "../paraglide/messages.js";
import { themeFrom } from "../theme";
import { notificationsPath, novu, pwa } from "./site";

/**
 * The PWA's routes: manifest, worker, offline pages and push API (`pwa.mount`), and
 * /cont/notificari — open to anyone (article news needs no account), never cached.
 */
export function registerPwa(app: Hono): void {
	pwa.mount(app);
	// Novu's Push Webhook (it signs every call): a client's booking pushes reach their devices on this site.
	mountPushHook(app, pwa, novu, "hemisync");
	for (const locale of ["ro", "en"] as const) {
		app.get(notificationsPath(locale), account.recognise(), async (c) => {
			const o = at(locale);
			const subject = account.current(c)?.subject ?? null;
			return c.html(
				<AccountFrame
					locale={locale}
					theme={themeFrom(getCookie(c, "theme"))}
					origin={new URL(c.req.url).origin}
					title={m.pwa_page_title({}, o)}
				>
					<div class="mx-auto flex max-w-3xl flex-col gap-8">
						<p class="text-body-lg text-ink-muted">{m.pwa_page_lead({}, o)}</p>
						{pwa.notifications({
							locale,
							signedIn: subject !== null,
							signInHref: account.signInHref(notificationsPath(locale)),
							devices: await pwa.devices(subject),
						})}
					</div>
				</AccountFrame>,
				200,
				{ "cache-control": "private, no-store" },
			);
		});
	}
}
