import {
	createAccount,
	type OwnBookingsPort,
	type ReservationsPort,
	type Say,
	sayer,
} from "@psi/account";
import {
	accountClientOn,
	accountHashOf,
	createTransport,
	readSchedulingEnv,
} from "@psi/scheduling";
import { ownBookings } from "@psi/scheduling-sdk";
import { type CompassGroup, readSchedulingApiEnv } from "@psi/ui";
import { ESTATE, SITE } from "./estate";
import { at, base, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";
import { accountsSignIn } from "./site-settings";

/**
 * Psizone's account: its own Authentik application `psizone-web`, the estate's one account
 * (docs/plans/accounts.md). Configured from the environment; outside production a missing value leaves sign-in
 * "not available" and the site serving everything else.
 */
export const account = createAccount({
	site: { slug: "psizone-web", key: "psizone", origin: ESTATE[SITE] },
});

/** The account pages, Romanian slugs in both locales (like every Psizone page). */
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

/** Every word of the account journey, from Psizone's own messages. */
export function accountSay(locale: Locale): Say {
	return sayer(m, locale);
}

/**
 * A signed-in person's previous reservations, from the scheduling store (CONVEX_URL); undefined when it is
 * off. The store knows the account only by its hash (`accountHashOf`); OpenFGA decides first, in the journey.
 */
const SCHEDULING = readSchedulingEnv(process.env);
export const reservations: ReservationsPort | undefined = SCHEDULING.ok
	? (() => {
			const own = accountClientOn(createTransport(SCHEDULING.config));
			return {
				requests: (subject) => own.requests(accountHashOf(subject)),
				async cancel(subject, reference) {
					return (await own.cancel({ reference, accountHash: accountHashOf(subject) })).ok;
				},
				async link(subject, reference, cancelCode) {
					return (
						await own.link({
							reference,
							cancelCode,
							accountHash: accountHashOf(subject),
						})
					).ok;
				},
				async unlink(subject) {
					await own.unlink(accountHashOf(subject));
				},
			};
		})()
	: undefined;

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
			app: "psizone",
			serviceKey: SCHEDULING_API.config.serviceKey,
			timeoutMs: SCHEDULING_API.config.timeoutMs,
		})
	: undefined;
/** What the port is called with: the signed-in person's subject (the site's key carries the trust). */
export const bookingsCredential = (_c: unknown, person: { subject: string }): Promise<string> =>
	Promise.resolve(person.subject);
