import {
	type Account,
	guideFor,
	JOURNEY_PAGES,
	prefillFor,
	refererPath,
	sameOrigin,
} from "@psi/account";
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

/** The error's code or name for the log: never its message, which may carry a connection string. */
function codeOf(error: unknown): string {
	if (typeof error === "object" && error !== null && "code" in error) return String(error.code);
	return error instanceof Error ? error.name : "unknown";
}

/**
 * The account side of a booking. When the account's store cannot be read (its database down), the
 * visitor books as anyone without an account does: the request still reaches the team, only the
 * pre-fill and the sign-in line are left out. A booking is never refused because of the account.
 */
export async function bookingAccount(
	c: Context,
	locale: Locale,
	fallback: string,
	source: Account = account,
): Promise<BookingAccount> {
	try {
		return await accountFor(c, locale, fallback, source);
	} catch (error) {
		console.error(`account: unavailable for a booking (${codeOf(error)})`);
		return { prefill: {} };
	}
}

async function accountFor(
	c: Context,
	locale: Locale,
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
						signInHref: source.signInHref(returnPath(c, locale, fallback)),
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
		accountHash: accountHashOf(person.subject),
		bookingsHref: `${base(locale)}${JOURNEY_PAGES.bookings}`,
	};
}

/** The form's account line as a prop spread: nothing when sign-in is not configured. */
export function accountLine(who: BookingAccount): { account?: AccountLine } {
	return who.form === undefined ? {} : { account: who.form };
}

/**
 * The guide for this request: it remembers only for a signed-in person who consented, on this
 * origin. When the account's store cannot be read, the guide answers without memory, as it does
 * for anyone signed out.
 */
export async function guideForRequest(
	c: Context,
	guide: Guide,
	source: Account = account,
): Promise<Guide> {
	if (!sameOrigin(c.req.raw.headers, c.req.method, source.origin)) return guide;
	try {
		return await guideFor(source, c, guide, "psizone");
	} catch (error) {
		console.error(`account: unavailable for the guide (${codeOf(error)})`);
		return guide;
	}
}
