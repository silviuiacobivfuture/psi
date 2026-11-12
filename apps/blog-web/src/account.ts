import {
	createAccount,
	guideFor,
	type RecordRef,
	type SavedArticle,
	type Say,
	sayer,
} from "@psi/account";
import type { Guide } from "@psi/guide";
import type { CompassGroup } from "@psi/ui";
import type { Context } from "hono";
import { tryGetContext } from "hono/context-storage";
import { findArticle } from "./content/articles";
import { ESTATE, SITE } from "./estate";
import { at, base, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";
import { accountsSignIn } from "./site-settings";

/**
 * The blog's account: its own Authentik application `blog-web`, the estate's one account
 * (docs/plans/accounts.md). The reading list is the first record checked end to end through OpenFGA.
 */
export const account = createAccount({
	site: { slug: "blog-web", key: "blog", origin: ESTATE[SITE] },
});

/** The account pages, Romanian slugs in both locales. */
export const accountPaths = {
	home: (locale: Locale): string => `${base(locale)}/cont`,
	saveConfirm: (locale: Locale, slug: string): string =>
		`${base(locale)}/cont/salvate/nou?articol=${encodeURIComponent(slug)}`,
	save: (locale: Locale): string => `${base(locale)}/cont/salvate`,
	remove: (locale: Locale, id: string): string =>
		`${base(locale)}/cont/salvate/${encodeURIComponent(id)}/sterge`,
} as const;

/**
 * A saved article as OpenFGA sees it (estate/authz/modules/blog.fga): `blog_saved_article:<id>` on the platform, its
 * owner — the row's subject, the system of record — holding viewer and editor. Nothing is persisted in OpenFGA.
 */
export function savedRef(row: SavedArticle): RecordRef {
	return {
		object: `blog_saved_article:${row.id}`,
		owner: row.subject,
		ownerRelations: ["viewer", "editor"],
	};
}

const ARTICLE_PATH = /^(?:\/en)?\/(?:articole|articles)\/([^/?#]+)\/?$/;

/**
 * The Compass's account group: the account page, and — on an article — "Save this article". Static links: no page
 * reads the session to render, so public pages stay public and cacheable.
 */
export function accountGroup(locale: Locale): CompassGroup {
	const o = at(locale);
	const slug = ARTICLE_PATH.exec(tryGetContext()?.req.path ?? "")?.[1];
	const article = slug === undefined ? undefined : findArticle(decodeURIComponent(slug));
	return {
		label: m.account_group({}, o),
		items: [
			...(article === undefined
				? []
				: [
						{
							label: m.account_save_nav({}, o),
							href: accountPaths.saveConfirm(locale, article.slug),
							hint: m.account_save_nav_hint({}, o),
						},
					]),
			{
				label: m.account_nav({}, o),
				href: accountPaths.home(locale),
				hint: m.account_nav_hint({}, o),
			},
		],
	};
}

/** Every word of the account journey, from the blog's own messages. */
export function accountSay(locale: Locale): Say {
	return sayer(m, locale);
}

/** The guide for this request: it remembers only for a signed-in person who consented (see /cont/conversatii). */
export function guideForRequest(c: Context, guide: Guide): Promise<Guide> {
	return guideFor(account, c, guide, "blog");
}

/**
 * The Compass's account group, or none while accounts are off (production without account settings)
 * or the owners hid sign-in in the CMS (`accountsSignIn`).
 */
export function accountGroups(locale: Locale): CompassGroup[] {
	return account.enabled && accountsSignIn() ? [accountGroup(locale)] : [];
}
