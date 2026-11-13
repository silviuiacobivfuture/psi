import type { Guide } from "@psi/guide";
import { accountHashOf } from "@psi/scheduling";
import type { BookingAccount, BookingLocale } from "@psi/ui";
import type { Context } from "hono";
import type { Account } from "./account";
import { refererPath, sameOrigin } from "./guard";
import { guideFor, prefillFor } from "./journey/prefill";
import { JOURNEY_PAGES } from "./journey/views-shell";

/**
 * The estate account in a site's booking and guide flows (docs/plans/accounts.md, "Journey"): pre-fill for a
 * signed-in person, a sign-in invitation (back to where they are) for anyone else, and, on a site that lists
 * requests in its own account, the account hash on the request so it appears in the account's bookings. Nothing
 * here decides access: that is the journey's, via OpenFGA. A write from another origin (the estate's sites are
 * same-site with each other) is treated as anonymous.
 */
export interface BookingAccountOptions {
	account: Account;
	/** The site's key, as the guide's memory knows it. */
	site: Parameters<typeof guideFor>[3];
	/** The path prefix of a locale's pages ("" for Romanian, "/en"). */
	base: (locale: BookingLocale) => string;
	/**
	 * True when the site lists a person's requests in its own account: the request then carries the account hash
	 * and the form links to the bookings page. False: only the pre-fill and the sign-in line.
	 */
	listsRequests: boolean;
}

export interface BookingAccounts {
	/** The account side of a booking, never refused for want of the account (see below). */
	bookingAccount(
		c: Context,
		locale: BookingLocale,
		fallback: string,
		source?: Account,
	): Promise<BookingAccount>;
	/** The guide for this request: it remembers only for a signed-in person who consented, on this origin. */
	guideForRequest(c: Context, guide: Guide, source?: Account): Promise<Guide>;
}

/** The error's code or name for the log: never its message, which may carry a connection string. */
function codeOf(error: unknown): string {
	if (typeof error === "object" && error !== null && "code" in error) return String(error.code);
	return error instanceof Error ? error.name : "unknown";
}

/**
 * Where sign-in returns to: the page itself for a GET, the same-host page that sent a POST (a chat on any page);
 * `fallback` (a full path) when a POST names no page.
 */
function returnPath(c: Context, fallback: string): string {
	const url = new URL(c.req.url);
	if (c.req.method === "GET") return `${url.pathname}${url.search}`;
	const from = refererPath(c.req.header("referer"), url.host);
	return from === "/" && c.req.header("referer") === undefined ? fallback : from;
}

export function createBookingAccounts(options: BookingAccountOptions): BookingAccounts {
	async function accountFor(
		c: Context,
		locale: BookingLocale,
		fallback: string,
		source: Account,
	): Promise<BookingAccount> {
		if (!sameOrigin(c.req.raw.headers, c.req.method, source.origin)) return { prefill: {} };
		const ready = source.status.identity === "ready";
		const person = await source.person(c);
		if (person === null) {
			return ready
				? {
						form: {
							signedIn: false,
							signInHref: source.signInHref(returnPath(c, fallback)),
						},
						prefill: {},
					}
				: { prefill: {} };
		}
		const filled = await prefillFor(source, c);
		return {
			form: { signedIn: true },
			prefill: {
				...(filled?.name ? { name: filled.name } : {}),
				...(filled?.email ? { email: filled.email } : {}),
				...(filled?.phone ? { phone: filled.phone } : {}),
			},
			...(options.listsRequests
				? {
						accountHash: accountHashOf(person.subject),
						bookingsHref: `${options.base(locale)}${JOURNEY_PAGES.bookings}`,
					}
				: {}),
		};
	}
	return {
		/**
		 * When the account's store cannot be read (its database down), the visitor books as anyone without an account
		 * does: the request still reaches the team, only the pre-fill and the sign-in line are left out. A booking is
		 * never refused because of the account.
		 */
		async bookingAccount(c, locale, fallback, source = options.account) {
			try {
				return await accountFor(c, locale, fallback, source);
			} catch (error) {
				console.error(`account: unavailable for a booking (${codeOf(error)})`);
				return { prefill: {} };
			}
		},
		/** When the account's store cannot be read, the guide answers without memory, as it does for anyone signed out. */
		async guideForRequest(c, guide, source = options.account) {
			if (!sameOrigin(c.req.raw.headers, c.req.method, source.origin)) return guide;
			try {
				return await guideFor(source, c, guide, options.site);
			} catch (error) {
				console.error(`account: unavailable for the guide (${codeOf(error)})`);
				return guide;
			}
		},
	};
}
