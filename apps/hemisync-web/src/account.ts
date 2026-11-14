import {
	createAccount,
	createBookingAccounts,
	type OwnBookingsPort,
	type Say,
	sayer,
} from "@psi/account";
import { ownBookings } from "@psi/scheduling-sdk";
import { type CompassGroup, readSchedulingApiEnv } from "@psi/ui";
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
 * account's database being down. A signed-in person's request is theirs: it shows in this site's "Programările mele"
 * (through the scheduling service), and the e-mail their sign-in vouches for goes with it, so the service can link
 * them to their clinic record.
 */
export const { bookingAccount, guideForRequest } = createBookingAccounts({
	account,
	site: "hemisync",
	base,
	listsRequests: true,
});

/**
 * The Compass's account group, or none while accounts are off (production without account settings)
 * or the owners hid sign-in in the CMS (`accountsSignIn`).
 */
export function accountGroups(locale: Locale): CompassGroup[] {
	return account.enabled && accountsSignIn() ? [accountGroup(locale)] : [];
}

/**
 * "Programările mele" through the scheduling service, with this site's own service key naming the person it signed in
 * (`SCHEDULING_API_URL` + `SCHEDULING_SERVICE_KEY`, the same pair the booking forms use): the service decides whose a
 * booking is, so the port's credential is the person's subject. Undefined while the site has no scheduling service.
 */
const SCHEDULING_API = readSchedulingApiEnv(process.env);
export const bookings: OwnBookingsPort | undefined = SCHEDULING_API.ok
	? ownBookings({
			baseUrl: SCHEDULING_API.config.url,
			app: "hemisync",
			serviceKey: SCHEDULING_API.config.serviceKey,
			timeoutMs: SCHEDULING_API.config.timeoutMs,
		})
	: undefined;
/** What the port is called with: the signed-in person's subject (the site's key carries the trust). */
export const bookingsCredential = (_c: unknown, person: { subject: string }): Promise<string> =>
	Promise.resolve(person.subject);
