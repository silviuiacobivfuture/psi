import type { Context } from "hono";
import type { Child } from "hono/jsx";
import type { Account } from "../account";
import type { RecordRef, SignedIn } from "../guard";
import type { Purpose } from "../stores/types";
import type { Say } from "./labels";
import type { ReservationsPort } from "./ports";

/** How a site plugs the journey into its own shell, theme and stores. */
export interface JourneyOptions {
	account: Account;
	locale: "ro" | "en";
	/** The locale's path prefix: "" (Romanian) or "/en". */
	base: string;
	/** This site's key, for remembered conversations: "psizone", "eqsync", "hemisync", "blog". */
	site: string;
	/** The site's words: `sayer(m, locale)` with the site's paraglide messages. */
	say: Say;
	/** Renders a journey page in the site's own page shell. */
	render(
		c: Context,
		page: { title: string; body: Child; status?: number },
	): Response | Promise<Response>;
	/** The estate's sites by key, in this locale (conversation headings). */
	siteNames: Readonly<Record<string, string>>;
	/** Previous reservations; absent where the site has no scheduling store. */
	reservations?: ReservationsPort;
	/**
	 * Where export and erasure happen when this site has no reservations store: the Psizone account's data
	 * page (absolute). Required then, so an erasure never leaves bookings tied to the account.
	 */
	dataHome?: string;
	/** The purposes this site offers; only those that change something here. Default: guide memory. */
	purposes?: ReadonlyArray<Purpose>;
	/** Where "book an appointment" leads (Psizone's booking page, absolute on the other sites). */
	bookHref?: string;
	/** Where to find articles to save (the blog), and the full reading list. */
	readingHref?: string;
	savedListHref?: string;
	/** A saved article's title and link, for the overview and the timeline; absent: the slug is shown. */
	savedArticle?: (slug: string) => { title: string; href: string } | undefined;
	/** Something the site adds above the timeline on /cont (the blog's reading list). */
	homeExtra?: (c: Context, person: SignedIn) => Promise<Child>;
	now?: () => number;
}

/** Consent wording in force: recorded with every grant, so a later change of words is visible. */
export const WORDING_VERSION = "2026-11-12";

/** The person's own account, as OpenFGA sees it: they own it (contextual tuple), staff reach it by role. */
export function accountRef(subject: string): RecordRef {
	return {
		object: `psizone_account:${subject}`,
		owner: subject,
		ownerRelations: ["viewer", "editor", "eraser"],
	};
}

/** A booking request: its owner is the account the scheduling store returned it for. */
export function bookingRef(reference: string, owner: string): RecordRef {
	return {
		object: `psizone_booking_request:${reference}`,
		owner,
		ownerRelations: ["viewer", "editor"],
	};
}

/** A remembered conversation: its owner is the row's subject (the account database). */
export function threadRef(id: string, owner: string): RecordRef {
	return {
		object: `psizone_guide_thread:${id}`,
		owner,
		ownerRelations: ["viewer", "forgetter"],
	};
}

/** A form body as strings; files become empty. */
export async function formOf(c: Context): Promise<Record<string, string>> {
	const body = await c.req.parseBody();
	return Object.fromEntries(
		Object.entries(body).map(([k, v]) => [k, typeof v === "string" ? v : ""]),
	);
}

export const PRIVATE = { "cache-control": "private, no-store" } as const;

/**
 * A saved-article resolver over a catalogue (the sites pass @psi/content's `INDEX` and `articleUrl`): the title in
 * the page's language when there is one, else in the other.
 */
export function savedArticleIn(
	index: ReadonlyArray<{ slug: string; locale: string; title: string }>,
	locale: "ro" | "en",
	href: (slug: string) => string,
): (slug: string) => { title: string; href: string } | undefined {
	return (slug) => {
		const hit =
			index.find((a) => a.slug === slug && a.locale === locale) ??
			index.find((a) => a.slug === slug);
		return hit === undefined
			? undefined
			: { title: hit.title, href: href(slug) };
	};
}
