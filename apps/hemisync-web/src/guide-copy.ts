import { type CopyDefaults, liveGuideCopy } from "@psi/cms-client";
import { PSI_PROFILES } from "@psi/guide";
import { aiSettings } from "./ai-settings";
import { at, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";

/**
 * This site's built-in guide copy, from its own messages (and the guide's "not on our site"
 * line): what a visitor reads when the CMS studio set nothing, and what the studio shows as each
 * field's placeholder (through the control plane).
 */
export function guideCopyDefaults(locale: Locale): CopyDefaults {
	const o = at(locale);
	return {
		welcome: m.guide_intro({}, o),
		chips: [m.ask_suggest_1({}, o), m.ask_suggest_2({}, o), m.ask_suggest_3({}, o)],
		outOfScope: m.guide_refusal_out_of_scope({}, o),
		unknown: PSI_PROFILES.hemisync.locales[locale]?.unknown ?? "",
		exchangeLimit: m.guide_refusal_exchange_limit({}, o),
	};
}

/** The guide's copy a page renders now: what the studio published, else the built-in line. */
export function guideCopy(locale: Locale): CopyDefaults {
	return liveGuideCopy(aiSettings, locale, guideCopyDefaults(locale));
}
