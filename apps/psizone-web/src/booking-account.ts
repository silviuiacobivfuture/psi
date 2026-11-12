import { guideFor, JOURNEY_PAGES, prefillFor, refererPath, sameOrigin } from "@psi/account";
import type { Guide } from "@psi/guide";
import { accountHashOf } from "@psi/scheduling";
import type { Context } from "hono";
import { account } from "./account";
import type { BookingValues } from "./booking";
import { base, type Locale } from "./i18n";

/**
 * The estate account in Psizone's booking and guide flows (docs/plans/accounts.md, "Journey"): pre-fill for a
 * signed-in person, a sign-in invitation (back to where they are) for anyone else, and the account hash on the
 * request so it appears in /cont/programari. Nothing here decides access: that is the journey's, via OpenFGA.
 * A write from another origin (the estate's sites are same-site with each other) is treated as anonymous.
 */
export type AccountLine = { signedIn: true } | { signedIn: false; signInHref: string };

export interface BookingAccount {
	/** What the form says about the account; undefined when sign-in is not configured here. */
	form?: AccountLine;
	/** The profile's name, e-mail and phone, editable; empty for an anonymous visitor. */
	prefill: Pick<BookingValues, "name" | "email" | "phone">;
	/** `accountHashOf(subject)` for the scheduling store; undefined when anonymous. */
	accountHash?: string;
	/** The person's bookings page, when signed in. */
	bookingsHref?: string;
}

/** Where sign-in returns to: the page itself for a GET, the same-host page that sent a POST (a chat on any page). */
function returnPath(c: Context, locale: Locale, fallback: string): string {
	const url = new URL(c.req.url);
	if (c.req.method === "GET") return `${url.pathname}${url.search}`;
	const from = refererPath(c.req.header("referer"), url.host);
	return from === "/" && c.req.header("referer") === undefined
		? `${base(locale)}${fallback}`
		: from;
}

export async function bookingAccount(
	c: Context,
	locale: Locale,
	fallback: string,
): Promise<BookingAccount> {
	if (!sameOrigin(c.req.raw.headers, c.req.method, account.origin)) return { prefill: {} };
	const ready = account.status.identity === "ready";
	const person = await account.person(c);
	if (person === null) {
		return ready
			? {
					form: {
						signedIn: false,
						signInHref: account.signInHref(returnPath(c, locale, fallback)),
					},
					prefill: {},
				}
			: { prefill: {} };
	}
	const filled = await prefillFor(account, c);
	return {
		form: { signedIn: true },
		prefill: {
			...(filled?.name ? { name: filled.name } : {}),
			...(filled?.email ? { email: filled.email } : {}),
			...(filled?.phone ? { phone: filled.phone } : {}),
		},
		accountHash: accountHashOf(person.subject),
		bookingsHref: `${base(locale)}${JOURNEY_PAGES.bookings}`,
	};
}

/** The form's account line as a prop spread: nothing when sign-in is not configured. */
export function accountLine(who: BookingAccount): { account?: AccountLine } {
	return who.form === undefined ? {} : { account: who.form };
}

/** The guide for this request: it remembers only for a signed-in person who consented, on this origin. */
export function guideForRequest(c: Context, guide: Guide): Promise<Guide> {
	if (!sameOrigin(c.req.raw.headers, c.req.method, account.origin)) return Promise.resolve(guide);
	return guideFor(account, c, guide, "psizone");
}
