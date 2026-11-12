import { mountSiteControl, type SiteControl, type StaffLinkWords } from "@psi/site-control";
import type { Hono } from "hono";
import { account } from "./account";
import { aiSettings } from "./cms-routes";
import { guide } from "./guide-client";
import { at } from "./i18n";
import { m } from "./paraglide/messages.js";
import { pwa } from "./pwa/site";

/** The Compass's staff-only group, in the Blog's own words. */
export function staffLinkWords(locale: "ro" | "en"): StaffLinkWords {
	const o = at(locale);
	return { group: m.staff_group({}, o), label: m.staff_label({}, o), hint: m.staff_hint({}, o) };
}

/**
 * The control plane on the Blog (the CMS's /admin/platform): signed `/__control/*`, the `/admin`
 * redirect and the Compass's staff link, over the same guide, account and app visitors use. This
 * site books nothing, so its scheduling is not configured whatever the environment holds.
 */
export function mountControl(app: Hono): SiteControl {
	return mountSiteControl(app, {
		brand: "blog",
		guide,
		aiSettings,
		account,
		pwa,
		scheduling: { state: "not_configured" },
		staffLink: staffLinkWords,
	});
}
