import { createAccount, createBookingAccounts, type Say, sayer } from "@psi/account";
import type { CompassGroup } from "@psi/ui";
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

/**
 * The estate account in the booking and the guide: the pre-fill, the sign-in line, and the guide
 * remembering only for a signed-in person who consented (see /cont/conversatii). Both survive the
 * account's database being down. Requests are not listed in this site's account (its reservations
 * live on Psizone, where the scheduling account page is), so the request carries no account hash.
 */
export const { bookingAccount, guideForRequest } = createBookingAccounts({
	account,
	site: "hemisync",
	base,
	listsRequests: false,
});

/**
 * The Compass's account group, or none while accounts are off (production without account settings)
 * or the owners hid sign-in in the CMS (`accountsSignIn`).
 */
export function accountGroups(locale: Locale): CompassGroup[] {
	return account.enabled && accountsSignIn() ? [accountGroup(locale)] : [];
}
