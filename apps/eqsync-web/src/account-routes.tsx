import { registerJourney } from "@psi/account";
import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { account, accountSay } from "./account";
import { ESTATE, siteNames } from "./estate";
import { base, type Locale } from "./i18n";
import { AccountFrame } from "./pages/account";
import { themeFrom } from "./theme";

/**
 * The signed-in journey (docs/plans/accounts.md): /cont, profile, consents, remembered conversations — every
 * read and write checked through OpenFGA by @psi/account; never cached. Reservations, export and erasure live
 * on Psizone, where the scheduling store is: this site's data page sends the person there.
 */
export function registerAccountRoutes(app: Hono, locale: Locale): void {
	const prefix = base(locale);
	registerJourney(app, {
		account,
		locale,
		base: prefix,
		site: "eqsync",
		say: accountSay(locale),
		siteNames: siteNames(locale),
		dataHome: `${ESTATE.psizone}${prefix}/cont/date`,
		render: (c, page) =>
			c.html(
				<AccountFrame
					locale={locale}
					theme={themeFrom(getCookie(c, "theme"))}
					origin={new URL(c.req.url).origin}
					title={page.title}
				>
					{page.body}
				</AccountFrame>,
				page.status === 503 ? 503 : 200,
				{ "cache-control": "private, no-store" },
			),
	});
}
