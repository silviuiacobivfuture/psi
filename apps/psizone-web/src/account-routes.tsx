import { registerJourney } from "@psi/account";
import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { account, accountSay, reservations } from "./account";
import { siteNames } from "./estate";
import { base, type Locale } from "./i18n";
import { AccountFrame } from "./pages/account";
import { themeFrom } from "./theme";

/**
 * The signed-in journey (docs/plans/accounts.md): /cont, profile, consents, previous reservations,
 * remembered conversations, export and erasure — every read and write checked through OpenFGA by
 * @psi/account. Never cached.
 */
export function registerAccountRoutes(app: Hono, locale: Locale): void {
	const prefix = base(locale);
	registerJourney(app, {
		account,
		locale,
		base: prefix,
		site: "psizone",
		say: accountSay(locale),
		siteNames: siteNames(locale),
		...(reservations === undefined ? {} : { reservations }),
		render: (c, page) => {
			const here = new URL(c.req.url);
			return c.html(
				<AccountFrame
					locale={locale}
					theme={themeFrom(getCookie(c, "theme"))}
					origin={here.origin}
					path={here.pathname.slice(prefix.length) || "/cont"}
					title={page.title}
				>
					{page.body}
				</AccountFrame>,
				page.status === 503 ? 503 : 200,
				{ "cache-control": "private, no-store" },
			);
		},
	});
}
