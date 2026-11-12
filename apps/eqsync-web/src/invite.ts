import type { CompassInvite } from "@psi/ui";
import { at, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";
import { PAGES } from "./routes";

/**
 * EQ-SYNC's invitation for the page being served: the capsule's label, the example questions
 * (the first one fits the page), and the one nudge. Everything comes from the site's own routes
 * and messages, never from the browser.
 */
export function eqsyncInvite(locale: Locale, path: string): CompassInvite {
	const o = at(locale);
	const p = path.length > 1 ? path.replace(/\/+$/, "") : path;
	const examples = [m.invite_ph_1({}, o), m.invite_ph_2({}, o), m.invite_ph_3({}, o)];
	let lead: string | undefined;
	let nudge: { text: string; question: string };
	if (p === PAGES.signup[locale]) {
		lead = m.invite_ph_start({}, o);
		nudge = { text: m.nudge_start({}, o), question: m.nudge_q_start({}, o) };
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
