import { createAccount, guideFor, type OwnBookingsPort, type Say, sayer } from "@psi/account";
import type { Guide } from "@psi/guide";
import { ownBookings } from "@psi/scheduling-sdk";
import type { CompassGroup } from "@psi/ui";
import type { Context } from "hono";
import { z } from "zod";
import { ESTATE, SITE } from "./estate";
import { at, base, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";
import { accountsSignIn } from "./site-settings";

/**
 * Hemi-Sync's account: its own Authentik application `hemisync-web`, the estate's one account
 * (docs/plans/accounts.md). Configured from the environment; outside production a missing value leaves sign-in
 * "not available" and the site serving everything else.
 */
export const account = createAccount({
	site: { slug: "hemisync-web", key: "hemisync", origin: ESTATE[SITE] },
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
	return guideFor(account, c, guide, "hemisync");
}

/**
 * The Compass's account group, or none while accounts are off (production without account settings)
 * or the owners hid sign-in in the CMS (`accountsSignIn`).
 */
export function accountGroups(locale: Locale): CompassGroup[] {
	return account.enabled && accountsSignIn() ? [accountGroup(locale)] : [];
}

/**
 * "Programările mele" through the scheduling service, with the signed-in person's own token (the service decides whose
 * a booking is); undefined while the site has no `SCHEDULING_API_URL`.
 */
const SCHEDULING_API = z
	.string()
	.url()
	.optional()
	.parse(process.env.SCHEDULING_API_URL || undefined);
export const bookings: OwnBookingsPort | undefined =
	SCHEDULING_API === undefined
		? undefined
		: ownBookings({ baseUrl: SCHEDULING_API, app: "hemisync" });
