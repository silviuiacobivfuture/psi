import { fold, matchesAny } from "./normalize";
import { isClinical } from "./scope";

/**
 * Abuse aimed at the guide or the team, in Romanian and English, matched deterministically on
 * folded text: obscenities, slurs, insults addressed to "you", and threats. A clinic hears all of
 * these as symptoms too (tics, Tourette, a child swearing at school, a teenager being bullied), so
 * a question that is about health, development, therapy or a child is never refused here, however
 * it is worded; Mastra's `ModerationProcessor` judges those in context.
 */
const OBSCENE: ReadonlyArray<RegExp> = [
	/\b(pula|pulii|pulei|pizda|pizdei|pizdii|muie|muist|muista)\b/,
	/\b(fut|fute|futi|futu|futut|futea|futai|futui|fututi|futes|futeti)\b/,
	/\b(sugi|suge) pula\b/,
	/\b(du te|duceti va|mars) (dracu|dracului|naibii|in mortii|in pizda|la dracu)\b/,
	/\b(fuck|fucking|fucked|fucker|motherfucker|fuckin|f u c k|stfu)\b/,
	/\b(cunt|bitch|asshole|dickhead|whore|slut)\b/,
];

const SLURS: ReadonlyArray<RegExp> = [
	/\b(poponar|poponari|bozgor|bozgori|jidan|jidani|cioroi)\b/,
	/\b(faggot|fag|nigger|nigga|kike|tranny)\b/,
];

const INSULTS: ReadonlyArray<RegExp> = [
	/\b(esti|sunteti|esti doar) (un |o )?(prost|proasta|idiot|idioata|bou|vaca|tampit|tampita|cretin|cretina|dobitoc|dobitoaca|nenorocit|nenorocita|ratat|ratata|inutil|inutila|handicapat|handicapata|retardat|retardata|jalnic|jalnica|penibil|penibila)\b/,
	/\b(prostule|idiotule|boule|cretinule|dobitocule|nenorocitule|tampitule|ratatule|handicapatule|retardatule|proasto|idioato|vaco)\b/,
	/\b(taci|tacet|taci naibii|taci dracu) (din gura|naibii|dracului|odata)\b/,
	/\b(you are|you re|ur|youre) (a |an |so |such a |fucking )?(stupid|idiot|moron|useless|dumb|retarded|worthless|pathetic|garbage|trash|joke)\b/,
	/\b(shut up|piss off|screw you|go to hell)\b/,
];

const THREATS: ReadonlyArray<RegExp> = [
	/\b(va|te) (omor|ucid|distrug)\b/,
	/\b(i ll|i will|i m going to|im going to|gonna|i m gonna) (kill|hurt|find|destroy|rape|beat) (you|u|all of you|your)\b/,
	/\b(bomb|bomba|bombe) (la|in|at|on) (voi|clinica|centru|you|the clinic|your)\b/,
];

const ABUSE: ReadonlyArray<RegExp> = [...OBSCENE, ...SLURS, ...INSULTS, ...THREATS];

/**
 * True when the question is abuse rather than a question: abusive language with nothing about
 * health, development, therapy or a child around it.
 */
export function isAbusive(text: string): boolean {
	return matchesAny(fold(text), ABUSE) && !isClinical(text);
}
