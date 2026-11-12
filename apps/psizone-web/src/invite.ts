import { barePath, type CompassInvite } from "@psi/ui";
import { HUBS } from "./content/hubs";
import type { Localised } from "./content/localised";
import { METHODS } from "./content/methods";
import { at, base, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";

/**
 * How each hub reads inside a sentence ("o întrebare despre …"): the hub's own title would read
 * badly there ("despre După un AVC"), so each carries the short phrase that fits.
 */
const TOPIC: Readonly<Record<string, Localised>> = {
	autism: { ro: "autism", en: "autism" },
	adhd: { ro: "ADHD", en: "ADHD" },
	sensory: { ro: "integrarea senzorială", en: "sensory integration" },
	speech: { ro: "logopedie", en: "speech therapy" },
	teens: { ro: "adolescență", en: "adolescence" },
	adults: { ro: "anxietate și depresie", en: "anxiety and depression" },
	couple: { ro: "cuplu și familie", en: "couples and family" },
	stroke: { ro: "recuperarea după AVC", en: "recovery after a stroke" },
	oncology: { ro: "psiho-oncologie", en: "psycho-oncology" },
	sport: { ro: "psihologia sportivă", en: "sport psychology" },
};

/**
 * Psizone's invitation for the page being served: the capsule's label, the example questions
 * (the first one fits the page), and the one nudge. Everything comes from the site's own content
 * and messages, never from the browser.
 */
export function psizoneInvite(locale: Locale, path: string): CompassInvite {
	const o = at(locale);
	const p = barePath(path);
	const examples = [m.invite_ph_1({}, o), m.invite_ph_2({}, o), m.invite_ph_3({}, o)];
	const hub = HUBS.find((h) => h.path === p);
	const method = METHODS.find((x) => x.path === p);
	const close = m.invite_close({}, o);
	const topic = hub === undefined ? undefined : (TOPIC[hub.id]?.[locale] ?? hub.title(o));
	let lead: string | undefined;
	let nudge: { text: string; question: string };
	if (hub !== undefined && topic !== undefined) {
		lead = m.invite_ph_topic({ topic }, o);
		nudge = { text: m.nudge_topic({ topic }, o), question: m.nudge_q_topic({ topic }, o) };
	} else if (method !== undefined) {
		const name = method.name[locale];
		nudge = {
			text: m.nudge_method({ topic: name }, o),
			question: m.nudge_q_method({ topic: name }, o),
		};
	} else if (p === "/contact") {
		lead = m.invite_ph_booking({}, o);
		nudge = { text: m.nudge_booking({}, o), question: m.nudge_q_booking({}, o) };
	} else if (p === "/") {
		nudge = { text: m.nudge_home({}, o), question: m.nudge_q_home({}, o) };
	} else {
		nudge = { text: m.nudge_page({}, o), question: m.nudge_q_page({}, o) };
	}
	return {
		label: m.invite_label({}, o),
		placeholders: lead === undefined ? examples : [lead, ...examples],
		nudge: { ...nudge, close },
		signalUrl: `${base(locale)}/ghid/signal`,
	};
}
