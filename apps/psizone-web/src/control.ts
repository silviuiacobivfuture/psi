import type { PartState } from "@psi/cms-client";
import { readSchedulingEnv } from "@psi/scheduling";
import { mountSiteControl, type SiteControl, type StaffLinkWords } from "@psi/site-control";
import type { Hono } from "hono";
import { account, reservations } from "./account";
import { aiSettings } from "./ai-settings";
import { guide } from "./guide-client";
import { guideCopyDefaults } from "./guide-copy";
import { at } from "./i18n";
import { m } from "./paraglide/messages.js";
import { pwa } from "./pwa/site";

/** Whether the evaluation calendar is configured (never a key): on, absent, or why it is off. */
export function schedulingState(env: Readonly<Record<string, string | undefined>>): {
	state: PartState;
	reason?: string;
} {
	const read = readSchedulingEnv(env);
	if (read.ok) return { state: "on" };
	return read.problem === "no_url"
		? { state: "not_configured" }
		: { state: "error", reason: read.problem };
}

/** The Compass's staff-only group, in Psizone's own words. */
export function staffLinkWords(locale: "ro" | "en"): StaffLinkWords {
	const o = at(locale);
	return { group: m.staff_group({}, o), label: m.staff_label({}, o), hint: m.staff_hint({}, o) };
}

/**
 * The control plane on Psizone (the CMS's /admin/platform): signed `/__control/*`, the `/admin`
 * redirect and the Compass's staff link, over the same guide, account and app visitors use.
 */
export function mountControl(app: Hono): SiteControl {
	return mountSiteControl(app, {
		brand: "psizone",
		guide,
		aiSettings,
		account,
		...(reservations === undefined ? {} : { reservations }),
		pwa,
		scheduling: schedulingState(process.env),
		staffLink: staffLinkWords,
		guideCopy: guideCopyDefaults,
	});
}
