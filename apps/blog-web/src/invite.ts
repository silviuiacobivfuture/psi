import type { CompassInvite } from "@psi/ui";
import { at, base, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";
import { routes } from "./routes";

/** Whether the path is an article's, by the site's own article route. */
function isArticle(locale: Locale, path: string): boolean {
	const [before = "", after = ""] = routes.article(locale, "\0").split("\0");
	return (
		path.startsWith(before) && path.endsWith(after) && path.length > before.length + after.length
	);
}

/**
 * The Blog's invitation for the page being served: the capsule's label, the example questions
 * (the first one fits the page), and the one nudge. Everything comes from the site's own routes
 * and messages, never from the browser.
 */
export function blogInvite(locale: Locale, path: string): CompassInvite {
	const o = at(locale);
	const p = path.length > 1 ? path.replace(/\/+$/, "") : path;
	const examples = [m.invite_ph_1({}, o), m.invite_ph_2({}, o), m.invite_ph_3({}, o)];
	let lead: string | undefined;
	let nudge: { text: string; question: string };
	if (isArticle(locale, p)) {
		lead = m.article_ask_placeholder({}, o);
		nudge = { text: m.nudge_article({}, o), question: m.nudge_q_article({}, o) };
	} else if (p === routes.home(locale) || p === "/") {
		nudge = { text: m.nudge_home({}, o), question: m.nudge_q_home({}, o) };
	} else {
		nudge = { text: m.nudge_page({}, o), question: m.nudge_q_page({}, o) };
	}
	return {
		label: m.invite_label({}, o),
		placeholders: lead === undefined ? examples : [lead, ...examples],
		nudge: { ...nudge, close: m.invite_close({}, o) },
		signalUrl: `${base(locale)}/ghid/signal`,
	};
}
