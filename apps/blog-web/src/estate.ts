import {
	type CompassGroup,
	type EstateLink,
	type EstateOrigins,
	type EstateSite,
	estateInput,
	estateLinks,
} from "@psi/ui";
import { z } from "zod";
import { at, base, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";

const Origin = z
	.string()
	.url()
	.transform((url) => new URL(url).origin);

/**
 * The canonical origin of every estate site, from `PSIZONE_URL`, `EQSYNC_URL`, `HEMISYNC_URL`
 * and `BLOG_URL` (local dev ports when unset). A malformed value stops the boot.
 */
export const ESTATE: EstateOrigins = z
	.object({ psizone: Origin, eqsync: Origin, hemisync: Origin, blog: Origin })
	.parse(estateInput());

/** This site. */
export const SITE: EstateSite = "blog";

/** Each site in its own name. */
export function siteNames(locale: Locale): Record<EstateSite, string> {
	const o = at(locale);
	return {
		psizone: m.estate_psizone({}, o),
		eqsync: m.estate_eqsync({}, o),
		hemisync: m.estate_hemisync({}, o),
		blog: m.estate_blog({}, o),
	};
}

/** The footer's estate row: the four sites, each linking to its home in this language. */
export function estateRow(locale: Locale): ReadonlyArray<EstateLink> {
	return estateLinks(ESTATE, siteNames(locale), SITE, base(locale));
}

/**
 * The compass group of the brand sites: every article belongs to one of them and links back to
 * it (docs/brands/linking.md).
 */
export function estateGroup(locale: Locale): CompassGroup {
	const o = at(locale);
	const hints: Partial<Record<EstateSite, string>> = {
		eqsync: m.estate_hint_eqsync({}, o),
		hemisync: m.estate_hint_hemisync({}, o),
		psizone: m.estate_hint_psizone({}, o),
	};
	return {
		label: m.estate_group({}, o),
		items: estateRow(locale)
			.filter((link) => !link.current)
			.map((link) => ({ label: link.label, href: link.href, hint: hints[link.site] })),
	};
}
