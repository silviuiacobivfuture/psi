import { fold } from "./text/normalize";

/**
 * A site that books its own appointments never tells a visitor it cannot see the calendar. A model
 * reply that says so is blocked and the booking's own offer goes out instead (the guard runs on the
 * finished reply, whatever the prompt asked for). Romanian and English, on folded text.
 */
const DENIALS: ReadonlyArray<RegExp> = [
	/\bnu (?:am|avem|dispun de|dispunem de) (?:acces|posibilitatea|cum)\b.{0,40}\b(?:calendar\w*|orar\w*|agenda|disponibilitat\w*|orel\w* libere|programul de programari)/,
	/\bnu (?:pot|putem|ma pot) (?:vedea|accesa|verifica|consulta|afla|intra in)\b.{0,30}\b(?:calendar\w*|orar\w*|agenda|disponibilitat\w*|orel\w* libere)/,
	/\bnu (?:vad|stiu|cunosc)\b.{0,20}\b(?:calendar\w*|orel\w* libere|disponibilitat\w*)/,
	/\b(?:do not|don t|dont|cannot|can t|cant|am unable to|unable to|not able to) (?:have )?(?:access|see|check|view|look up|reach)\b.{0,30}\b(?:calendar|schedule|availability|free (?:times|slots|hours)|agenda)/,
	/\bno access to (?:the |our |a )?(?:calendar|schedule|availability|free (?:times|slots))/,
];

/** True when a reply claims the calendar, the schedule or the free times are out of reach. */
export function deniesCalendar(text: string): boolean {
	const folded = fold(text).replace(/[\u2018\u2019']/g, " ");
	return DENIALS.some((rule) => rule.test(folded));
}
