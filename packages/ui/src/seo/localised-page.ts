import { requestPath } from "./page-context";
import type { SeoAlternate } from "./seo-head";

/** Where one page lives: psi serves the root locale at `/` and every other under `/<locale>`. */
export interface LocalisedPage {
	/** This page's path, without a trailing slash (`/`, `/en`, `/copii/autism`). */
	path: string;
	/** Absolute URL on the canonical origin. */
	canonical: string;
	/** Absolute URL of this locale's home page. */
	home: string;
	isHome: boolean;
	/** This page and its other-language version, root locale first; one item when untranslated. */
	alternates: ReadonlyArray<SeoAlternate>;
}

function prefix(locale: string, root: string): string {
	return locale === root ? "" : `/${locale}`;
}

/** The same path under another locale's prefix (`/en/x` → `/x`), when segments are shared. */
function swap(path: string, from: string, to: string, root: string): string {
	const rest = prefix(from, root) === "" ? path : path.slice(prefix(from, root).length) || "/";
	const target = prefix(to, root);
	return target === "" ? rest : rest === "/" ? target : `${target}${rest}`;
}

/**
 * The page being rendered, re-rooted on the site's canonical origin (never the request's, which
 * is wrong behind a proxy). The path comes from the request (`contextStorage()`), else from the
 * other language's URL the page already knows; `alternate` absent means the page is untranslated.
 */
export function localisedPage(
	origin: string,
	locale: string,
	alternate: { locale: string; href: string } | undefined,
	root = "ro",
): LocalisedPage {
	const otherPath = alternate === undefined ? undefined : new URL(alternate.href).pathname;
	const path =
		requestPath() ??
		(alternate !== undefined && otherPath !== undefined
			? swap(otherPath, alternate.locale, locale, root)
			: prefix(locale, root) || "/");
	const canonical = `${origin}${path}`;
	const home = `${origin}${prefix(locale, root) || "/"}`;
	const own = { hreflang: locale, href: canonical };
	const alternates =
		alternate === undefined || otherPath === undefined
			? [own]
			: [own, { hreflang: alternate.locale, href: `${origin}${otherPath}` }].sort((a, b) =>
					a.hreflang === root ? -1 : b.hreflang === root ? 1 : 0,
				);
	return { path, canonical, home, isHome: canonical === home, alternates };
}

/** A page's own name: its `<title>` without a trailing " — Site" or " | Site". */
export function pageName(title: string, site: string): string {
	const escaped = site.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return title.replace(new RegExp(`\\s+[—–|-]\\s+${escaped}$`), "");
}
