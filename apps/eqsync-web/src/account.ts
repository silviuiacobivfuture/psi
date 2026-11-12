import { createAccount, guideFor, type Say, sayer } from "@psi/account";
import type { Guide } from "@psi/guide";
import type { CompassGroup } from "@psi/ui";
import type { Context } from "hono";
import { ESTATE, SITE } from "./estate";
import { at, base, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";

/**
 * EQ-SYNC's account: its own Authentik application `eqsync-web`, the estate's one account
 * (docs/plans/accounts.md). Configured from the environment; outside production a missing value leaves sign-in
 * "not available" and the site serving everything else.
 */
export const account = createAccount({
	site: { slug: "eqsync-web", key: "eqsync", origin: ESTATE[SITE] },
});

/** The account page, Romanian slug in both locales (like the site's other pages). */
export function accountPath(locale: Locale): string {
	return `${base(locale)}/cont`;
}

/** The Compass's account group: one static link, so no public page reads the session to render. */
export function accountGroup(locale: Locale): CompassGroup {
	const o = at(locale);
	return {
		label: m.account_group({}, o),
		items: [
			{
				label: m.account_nav({}, o),
				href: accountPath(locale),
				hint: m.account_nav_hint({}, o),
			},
		],
	};
}

/** Every word of the account journey, from the site's own messages. */
export function accountSay(locale: Locale): Say {
	return sayer(m, locale);
}

/** The guide for this request: it remembers only for a signed-in person who consented (see /cont/conversatii). */
export function guideForRequest(c: Context, guide: Guide): Promise<Guide> {
	return guideFor(account, c, guide, "eqsync");
}

/** The Compass's account group, or none while accounts are off (production without account settings). */
export function accountGroups(locale: Locale): CompassGroup[] {
	return account.enabled ? [accountGroup(locale)] : [];
}
