import type { CompassInvite } from "@psi/ui";
import { at, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";
import { PAGES } from "./routes";

/**
 * Hemi-Sync's invitation for the page being served: the capsule's label, the example questions
 * (the first one fits the page), and the one nudge. Everything comes from the site's own routes
 * and messages, never from the browser.
 */
export function hemisyncInvite(locale: Locale, path: string): CompassInvite {
	const o = at(locale);
	const p = path.length > 1 ? path.replace(/\/+$/, "") : path;
	const examples = [m.invite_ph_1({}, o), m.invite_ph_2({}, o), m.invite_ph_3({}, o)];
	const programmes = PAGES.programmes[locale];
	let lead: string | undefined;
	let nudge: { text: string; question: string };
	if (p === programmes || p.startsWith(`${programmes}/`)) {
		lead = m.invite_ph_programme({}, o);
		nudge = { text: m.nudge_programme({}, o), question: m.nudge_q_programme({}, o) };
	} else if (p === PAGES.contact[locale]) {
		nudge = { text: m.nudge_contact({}, o), question: m.nudge_q_contact({}, o) };
	} else if (p === "/" || p === "/en") {
		nudge = { text: m.nudge_home({}, o), question: m.nudge_q_home({}, o) };
	} else {
		nudge = { text: m.nudge_page({}, o), question: m.nudge_q_page({}, o) };
	}
	return {
		label: m.invite_label({}, o),
		placeholders: lead === undefined ? examples : [lead, ...examples],
		nudge: { ...nudge, close: m.invite_close({}, o) },
		signalUrl: `${locale === "ro" ? "" : "/en"}/ghid/signal`,
	};
}
