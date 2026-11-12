/**
 * THE switch for retired sites. A site listed here is withdrawn from everything a visitor or the
 * team sees (estate footer and compass, blog listings/feeds/sitemap, guides' routing and
 * handoffs, the CMS pickers and tabs) and is no longer required at boot. Its code, its content
 * and its data are untouched. Retired 2026-11-12 on the owner's order: EQ-SYNC. To revive a site,
 * remove it from this list (and follow `apps/<app>/DEPRECATED.md`).
 *
 * A leaf module with no imports, so every package can take it (`@psi/content/retired`), the ui
 * and the service worker included, without loading the article catalogue.
 */
export const RETIRED_SITES = ["eqsync"] as const;

/** Whether a site or brand key is retired. */
export function isRetired(key: string, retired: ReadonlyArray<string> = RETIRED_SITES): boolean {
	return retired.includes(key);
}

/** The list without its retired members, in order. */
export function live<T extends string>(
	list: ReadonlyArray<T>,
	retired: ReadonlyArray<string> = RETIRED_SITES,
): ReadonlyArray<T> {
	return list.filter((k) => !isRetired(k, retired));
}
