import {
	createAccount,
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
import type { CompassGroup } from "@psi/ui";
import { ESTATE, SITE } from "./estate";
import { at, base, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";

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
					return (
						await own.cancel({ reference, accountHash: accountHashOf(subject) })
					).ok;
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

/** The Compass's account group, or none while accounts are off (production without account settings). */
export function accountGroups(locale: Locale): CompassGroup[] {
	return account.enabled ? [accountGroup(locale)] : [];
}
